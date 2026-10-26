<?php
// statistik-export.php: gibt die Zugriffsprotokolle dieses Servers anonymisiert an die Auswertung in Supabase.
// Zugriff nur mit geheimem Schluessel im Kopf "X-Stat-Token"; hier steht nur dessen SHA-256-Pruefsumme.
// IP-Adressen verlassen den Server nie im Klartext: gekuerzt (ip_anon) und als feste Kennung (visitor).
// Laeuft auf PHP 7.1.

const TOKEN_SHA256 = '9dfd36eae0e7006e92ace6bc15737f09f631071f87dff83ebf68b4b6ba35d0d4';
const MAX_ZEILEN = 5000;

$token = isset($_SERVER['HTTP_X_STAT_TOKEN']) ? (string)$_SERVER['HTTP_X_STAT_TOKEN'] : '';
if ($token === '' || !hash_equals(TOKEN_SHA256, hash('sha256', $token))) {
    http_response_code(404);
    exit;
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function ipKuerzen($ip)
{
    $bin = @inet_pton($ip);
    if ($bin === false) {
        return '';
    }
    if (strlen($bin) === 16 && substr($bin, 0, 12) === hex2bin('00000000000000000000ffff')) {
        $bin = substr($bin, 12); // IPv4 in IPv6-Schreibweise
    }
    if (strlen($bin) === 4) {
        $b = unpack('C4', $bin);
        return $b[1] . '.' . $b[2] . '.' . $b[3] . '.0';
    }
    return inet_ntop(substr($bin, 0, 6) . str_repeat("\0", 10)); // IPv6: nur die ersten 48 Bit
}

function kuerzen($s, $max)
{
    $s = ($s === '-') ? '' : $s;
    return mb_substr($s, 0, $max, 'UTF-8');
}

$since = isset($_GET['since']) ? (int)$_GET['since'] : (time() - 14 * 86400);
$schluessel = hash_hmac('sha256', 'immbild-statistik-v1', $token);

// Moegliche Orte der Protokolle: die Domain immbild.de ist eine Zusatzdomain, ihre Logs liegen unter system/immbild.de/logs
$kandidaten = array(
    '/var/www/vhosts/system/immbild.de/logs/',
    dirname(__DIR__, 2) . '/system/immbild.de/logs/',
    __DIR__ . '/../logs/',
);
if (isset($_GET['diag'])) {
    $kinfo = array();
    foreach ($kandidaten as $k) {
        $kinfo[] = array('pfad' => $k, 'ist_verz' => @is_dir($k), 'beispiele' => @is_dir($k) ? array_slice((array)@scandir($k), 0, 12) : null);
    }
    $kinfo[] = array('open_basedir' => ini_get('open_basedir'), 'dir' => __DIR__, 'php' => PHP_VERSION);
    echo json_encode(array('ok' => true, 'kandidaten' => $kinfo));
    exit;
}
$verz = $kandidaten[2];
foreach ($kandidaten as $k) {
    if (@is_dir($k) && glob($k . 'proxy_access*')) {
        $verz = $k;
        break;
    }
}
$dateien = is_dir($verz) ? glob($verz . 'proxy_access*') : array();
$dateien = array_values(array_filter((array)$dateien, function ($f) {
    return is_file($f) && is_readable($f) && substr($f, -8) !== '.statbuf';
}));
if (!$dateien) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'diag' => array(
        'verzeichnis' => $verz,
        'vorhanden' => is_dir($verz),
        'open_basedir' => ini_get('open_basedir'),
        'php' => PHP_VERSION,
    )));
    exit;
}

$zeilen = array();
$gelesen = 0;
$unlesbar = 0;
$zaehler = array();
foreach ($dateien as $datei) {
    $inhalt = (substr($datei, -3) === '.gz') ? @gzfile($datei) : @file($datei, FILE_IGNORE_NEW_LINES);
    if (!is_array($inhalt)) {
        continue;
    }
    $https = strpos(basename($datei), 'ssl') !== false;
    foreach ($inhalt as $roh) {
        $roh = rtrim($roh, "\r\n");
        if ($roh === '') {
            continue;
        }
        $gelesen++;
        if (!preg_match('/^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/', $roh, $m)) {
            $unlesbar++;
            continue;
        }
        $zeit = DateTime::createFromFormat('d/M/Y:H:i:s O', $m[2]);
        if (!$zeit) {
            $unlesbar++;
            continue;
        }
        $ts = $zeit->getTimestamp();
        if ($ts < $since) {
            continue;
        }
        $teile = explode(' ', $m[3], 3);
        $pfad = isset($teile[1]) ? $teile[1] : '';
        if (strpos($pfad, '/statistik-export.php') === 0) {
            continue; // der Abruf selbst gehoert nicht in die Statistik
        }
        $n = isset($zaehler[$roh]) ? $zaehler[$roh] + 1 : 1;
        $zaehler[$roh] = $n;
        $zeilen[] = array(
            'id' => hash_hmac('sha1', $roh . '#' . $n, $schluessel),
            'ts' => gmdate('Y-m-d\TH:i:s\Z', $ts),
            '_t' => $ts,
            'ip_anon' => ipKuerzen($m[1]),
            'visitor' => substr(hash_hmac('sha256', (string)@inet_ntop(@inet_pton($m[1])), $schluessel), 0, 20),
            'https' => $https,
            'method' => kuerzen(isset($teile[0]) ? $teile[0] : '', 12),
            'path' => kuerzen($pfad, 500),
            'protocol' => kuerzen(isset($teile[2]) ? $teile[2] : '', 12),
            'status' => (int)$m[4],
            'bytes' => $m[5] === '-' ? 0 : (int)$m[5],
            'referrer' => kuerzen($m[6], 500),
            'user_agent' => kuerzen($m[7], 400),
        );
    }
}
usort($zeilen, function ($a, $b) {
    return $a['_t'] - $b['_t'];
});
$mehr = count($zeilen) > MAX_ZEILEN;
$zeilen = array_slice($zeilen, 0, MAX_ZEILEN);
foreach ($zeilen as &$z) {
    unset($z['_t']);
}
unset($z);
echo json_encode(array(
    'ok' => true,
    'verzeichnis' => $verz,
    'gelesen' => $gelesen,
    'unlesbar' => $unlesbar,
    'dateien' => array_map('basename', $dateien),
    'mehr' => $mehr,
    'zeilen' => $zeilen,
));
