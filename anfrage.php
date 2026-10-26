<?php
// anfrage.php: nimmt das Kontaktformular von immbild.de an (laeuft auf PHP 7.1).
// 1) Mail mit Anhaengen an das eigene Postfach, 2) Kopie ohne Anhaenge in Supabase (Tabelle anfragen).
// Der Supabase-Schluessel ist der oeffentliche "publishable" Schluessel; die Tabelle erlaubt der Webseite nur "eintragen".

const EMPFAENGER = 'bastian.a.werner@immbild.de';
const ABSENDER = 'bastian.a.werner@immbild.de';
const SUPABASE_URL = 'https://obxulmldmxajugnidycf.supabase.co/rest/v1/anfragen';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ieHVsbWxkbXhhanVnbmlkeWNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NDg3MDUsImV4cCI6MjEwNzQyNDcwNX0.cFvyNCY63KZ4EnqiLAs_Oli_2XOCWWdsPpP1jJ-Zqvk';
const SITE_ID = '5ff93de0-9873-4800-b358-8c4141cff83b';
const MAX_ANHANG_GESAMT = 15728640; // 15 MB

$wantsJson = strpos(isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '', 'application/json') !== false;

function fertig($code, $ok, $fehler, $wantsJson)
{
    if ($wantsJson) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($ok ? array('ok' => true) : array('ok' => false, 'fehler' => $fehler));
    } elseif ($ok) {
        header('Location: /danke.html', true, 303);
    } else {
        http_response_code($code);
        header('Content-Type: text/plain; charset=utf-8');
        echo $fehler . "\nBitte schreiben Sie uns direkt an " . EMPFAENGER . ".";
    }
    exit;
}

function feld($name, $max, $einzeilig)
{
    $v = isset($_POST[$name]) && is_string($_POST[$name]) ? $_POST[$name] : '';
    $v = trim(str_replace("\0", '', $v));
    if ($einzeilig) {
        $v = trim(preg_replace('/\s+/u', ' ', $v));
    }
    return mb_substr($v, 0, $max, 'UTF-8');
}

function mimeKopf($text)
{
    return '=?UTF-8?B?' . base64_encode($text) . '?=';
}

if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    fertig(405, false, 'Nur POST erlaubt.', $wantsJson);
}

// Uebergrosse Sendung: PHP verwirft dann alle Felder
if (empty($_POST) && isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 0) {
    fertig(413, false, 'Die Anhaenge sind zu gross. Bitte weniger oder kleinere Dateien senden (zusammen hoechstens 15 MB).', $wantsJson);
}

// Verstecktes Feld: Roboter fuellen es aus, wir tun so, als waere alles gut
if (!empty($_POST['bot-field'])) {
    fertig(200, true, '', $wantsJson);
}

$name = feld('name', 200, true);
$email = feld('email', 254, true);
$telefon = feld('telefon', 80, true);
$ort = feld('ort', 200, true);
$nachricht = feld('nachricht', 10000, false);
$objektart = feld('objektart', 200, true);
$flaeche = feld('flaeche', 80, true);
$wunsch = feld('wunsch', 400, true);
$preis = feld('preisorientierung', 200, true);
$summ = feld('zusammenfassung', 2000, false);

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fertig(400, false, 'Bitte Name und eine gueltige E-Mail-Adresse angeben.', $wantsJson);
}
if (empty($_POST['datenschutz'])) {
    fertig(400, false, 'Bitte die Datenschutzhinweise bestaetigen.', $wantsJson);
}

// Anhaenge einsammeln
$anhaenge = array();
$summe = 0;
if (isset($_FILES['anhang'])) {
    $dateien = $_FILES['anhang'];
    if (!is_array($dateien['name'])) { // ein einzelnes Feld "anhang" statt "anhang[]"
        foreach (array('name', 'tmp_name', 'error', 'size') as $k) {
            $dateien[$k] = array($dateien[$k]);
        }
    }
    foreach ($dateien['name'] as $i => $dateiname) {
        $fehler = $dateien['error'][$i];
        if ($fehler === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($fehler !== UPLOAD_ERR_OK) {
            fertig(413, false, 'Ein Anhang konnte nicht uebertragen werden (zu gross?). Bitte kleinere Dateien senden.', $wantsJson);
        }
        $summe += (int)$dateien['size'][$i];
        if ($summe > MAX_ANHANG_GESAMT) {
            fertig(413, false, 'Die Anhaenge sind zusammen zu gross (hoechstens 15 MB).', $wantsJson);
        }
        $sauber = preg_replace('/[^\p{L}\p{N}._ -]+/u', '_', basename((string)$dateiname));
        $anhaenge[] = array('name' => $sauber !== '' ? $sauber : 'anhang', 'pfad' => $dateien['tmp_name'][$i]);
    }
}
$anhangNamen = implode(', ', array_map(function ($a) {
    return $a['name'];
}, $anhaenge));

// 1) Mail an das eigene Postfach
$zeilen = array(
    'Neue Anfrage ueber immbild.de',
    '',
    'Name: ' . $name,
    'E-Mail: ' . $email,
    'Telefon: ' . ($telefon !== '' ? $telefon : '-'),
    'Objektort: ' . ($ort !== '' ? $ort : '-'),
    '',
    'Zusammenstellung: ' . ($summ !== '' ? $summ : '-'),
    'Objektart: ' . ($objektart !== '' ? $objektart : '-'),
    'Flaeche: ' . ($flaeche !== '' ? $flaeche : '-'),
    'Wunsch: ' . ($wunsch !== '' ? $wunsch : '-'),
    'Preisorientierung: ' . ($preis !== '' ? $preis : '-'),
    '',
    'Nachricht:',
    $nachricht !== '' ? $nachricht : '-',
    '',
    'Anhaenge: ' . (count($anhaenge) ? $anhangNamen : 'keine'),
);
$text = implode("\r\n", $zeilen);
$grenze = '=_immbild_' . md5(uniqid('', true));
$kopf = 'From: ' . mimeKopf('immbild.de Formular') . ' <' . ABSENDER . ">\r\n"
    . 'Reply-To: ' . mimeKopf($name) . ' <' . $email . ">\r\n"
    . "MIME-Version: 1.0\r\n"
    . 'Content-Type: multipart/mixed; boundary="' . $grenze . '"';
$koerper = '--' . $grenze . "\r\n"
    . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
    . chunk_split(base64_encode($text));
foreach ($anhaenge as $a) {
    $inhalt = @file_get_contents($a['pfad']);
    if ($inhalt === false) {
        continue;
    }
    $koerper .= '--' . $grenze . "\r\n"
        . 'Content-Type: application/octet-stream; name="' . mimeKopf($a['name']) . "\"\r\n"
        . "Content-Transfer-Encoding: base64\r\n"
        . 'Content-Disposition: attachment; filename="' . mimeKopf($a['name']) . "\"\r\n\r\n"
        . chunk_split(base64_encode($inhalt));
}
$koerper .= '--' . $grenze . "--\r\n";
$mailOk = @mail(EMPFAENGER, mimeKopf('Neue Anfrage ueber immbild.de: ' . $name), $koerper, $kopf, '-f' . ABSENDER);
if (!$mailOk) {
    error_log('anfrage.php: mail() fehlgeschlagen');
}

// 2) Kopie in Supabase
$zeile = array(
    'site_id' => SITE_ID,
    'name' => $name,
    'email' => $email,
    'telefon' => $telefon !== '' ? $telefon : null,
    'ort' => $ort !== '' ? $ort : null,
    'nachricht' => $nachricht !== '' ? $nachricht : null,
    'objektart' => $objektart !== '' ? $objektart : null,
    'flaeche' => $flaeche !== '' ? $flaeche : null,
    'wunsch' => $wunsch !== '' ? $wunsch : null,
    'preisorientierung' => $preis !== '' ? $preis : null,
    'zusammenfassung' => $summ !== '' ? $summ : null,
    'anhaenge_anzahl' => count($anhaenge),
    'anhaenge_namen' => $anhangNamen !== '' ? mb_substr($anhangNamen, 0, 2000, 'UTF-8') : null,
    'mail_gesendet' => (bool)$mailOk,
);
$dbOk = false;
$kopfzeilen = array(
    'apikey: ' . SUPABASE_KEY,
    'Authorization: Bearer ' . SUPABASE_KEY,
    'Content-Type: application/json',
    'Prefer: return=minimal',
);
$json = json_encode($zeile);
if (function_exists('curl_init')) {
    $ch = curl_init(SUPABASE_URL);
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $json,
        CURLOPT_HTTPHEADER => $kopfzeilen,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
    ));
    curl_exec($ch);
    $dbOk = curl_getinfo($ch, CURLINFO_HTTP_CODE) === 201;
    curl_close($ch);
} else {
    $ctx = stream_context_create(array('http' => array(
        'method' => 'POST',
        'header' => implode("\r\n", $kopfzeilen),
        'content' => $json,
        'timeout' => 8,
        'ignore_errors' => true,
    )));
    @file_get_contents(SUPABASE_URL, false, $ctx);
    $dbOk = isset($http_response_header[0]) && strpos($http_response_header[0], ' 201') !== false;
}
if (!$dbOk) {
    error_log('anfrage.php: Supabase-Kopie fehlgeschlagen');
}

if ($mailOk || $dbOk) {
    fertig(200, true, '', $wantsJson);
}
fertig(502, false, 'Die Anfrage konnte gerade nicht gespeichert werden.', $wantsJson);
