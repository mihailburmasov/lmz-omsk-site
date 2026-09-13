<?php
/**
 * Приём заявок с сайта ООО «ЛМЗ» (формы «Рассчитать стоимость» и «Заказать звонок»).
 * Отвечает JSON {success, message}. Не хранит сессий, не требует БД — только PHP 7.4+.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$config = require __DIR__ . '/config.php';

date_default_timezone_set($config['timezone'] ?? 'Asia/Omsk');

function respond(bool $success, string $message): void
{
    echo json_encode(['success' => $success, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    respond(false, 'Недопустимый метод запроса.');
}

/* ---------- Проверка Origin (мягкая: включается, когда домены заданы в config.php) ---------- */
$allowedOrigins = $config['antispam']['allowed_origins'] ?? [];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($allowedOrigins) && $origin !== '' && !in_array($origin, $allowedOrigins, true)) {
    http_response_code(403);
    respond(false, 'Запрос отклонён.');
}

/* ---------- Honeypot ---------- */
if (!empty($_POST['website'])) {
    // Похоже на бота: молча "успешно" завершаем, ничего не отправляя и не логируя.
    respond(true, 'Заявка отправлена.');
}

/* ---------- Проверка скорости заполнения формы ---------- */
$minFillSeconds = (int) ($config['antispam']['min_fill_seconds'] ?? 3);
$formTs = isset($_POST['form_ts']) ? (int) $_POST['form_ts'] : 0;
if ($formTs > 0) {
    $elapsed = time() - $formTs;
    if ($elapsed >= 0 && $elapsed < $minFillSeconds) {
        http_response_code(429);
        respond(false, 'Форма заполнена слишком быстро. Попробуйте ещё раз.');
    }
}

/* ---------- Лимит отправок по IP ---------- */
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if (!checkRateLimit($ip, (int) ($config['antispam']['max_per_ip_per_hour'] ?? 5))) {
    http_response_code(429);
    respond(false, 'Слишком много заявок с вашего адреса. Попробуйте позже или позвоните нам.');
}

function checkRateLimit(string $ip, int $maxPerHour): bool
{
    $dir = __DIR__ . '/log/ratelimit';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $file = $dir . '/' . hash('sha256', $ip) . '.json';
    $now = time();
    $timestamps = [];

    if (is_file($file)) {
        $raw = file_get_contents($file);
        $decoded = json_decode($raw ?: '[]', true);
        if (is_array($decoded)) {
            $timestamps = $decoded;
        }
    }

    // оставляем только отметки за последний час
    $timestamps = array_values(array_filter($timestamps, static fn($t) => $now - (int) $t < 3600));

    if (count($timestamps) >= $maxPerHour) {
        return false;
    }

    $timestamps[] = $now;
    file_put_contents($file, json_encode($timestamps), LOCK_EX);
    return true;
}

/* ---------- Валидация полей ---------- */
function cleanText(string $value): string
{
    $value = trim($value);
    $value = str_replace(["\r", "\n"], ' ', $value);
    return $value;
}

$formType = in_array($_POST['form_type'] ?? '', ['calc', 'callback'], true) ? $_POST['form_type'] : 'calc';
$name = cleanText((string) ($_POST['name'] ?? ''));
$phoneRaw = (string) ($_POST['phone'] ?? '');
$phoneDigits = preg_replace('/\D/', '', $phoneRaw) ?? '';
$email = trim((string) ($_POST['email'] ?? ''));
$message = trim((string) ($_POST['message'] ?? ''));
$consent = (string) ($_POST['consent'] ?? '');
$pageUrl = cleanText((string) ($_POST['page_url'] ?? ''));

$errors = [];
if ($name === '' || mb_strlen($name) > 150) {
    $errors[] = 'name';
}
if (strlen($phoneDigits) !== 11) {
    $errors[] = 'phone';
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'email';
}
if ($consent !== '1') {
    $errors[] = 'consent';
}

if (!empty($errors)) {
    http_response_code(422);
    respond(false, 'Проверьте, пожалуйста, правильность заполнения полей формы.');
}

$phoneFormatted = '+' . $phoneDigits;

/* ---------- UTM-метки ---------- */
$utm = [];
foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $key) {
    if (!empty($_POST[$key])) {
        $utm[$key] = cleanText((string) $_POST[$key]);
    }
}

/* ---------- Вложение ---------- */
$attachmentPath = null;
$attachmentName = null;
if (!empty($_FILES['drawing']['name']) && $_FILES['drawing']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['drawing'];
    $maxSize = (int) ($config['attachment']['max_size'] ?? 10485760);
    $allowedExt = $config['attachment']['allowed_ext'] ?? [];
    $allowedMime = $config['attachment']['allowed_mime'] ?? [];

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']) ?: '';
    finfo_close($finfo);

    if ($file['size'] > $maxSize) {
        http_response_code(422);
        respond(false, 'Файл слишком большой. Максимальный размер — 10 МБ.');
    }
    if (!in_array($ext, $allowedExt, true)) {
        http_response_code(422);
        respond(false, 'Недопустимый тип файла.');
    }
    if (!empty($allowedMime) && !in_array($mime, $allowedMime, true)) {
        http_response_code(422);
        respond(false, 'Недопустимый тип файла.');
    }

    $attachmentPath = $file['tmp_name'];
    $safeBase = preg_replace('/[^A-Za-z0-9._-]/', '_', pathinfo($file['name'], PATHINFO_FILENAME));
    $attachmentName = ($safeBase !== '' ? $safeBase : 'file') . '.' . $ext;
}

/* ---------- Логирование заявки в CSV (на случай проблем с почтой) ---------- */
function logLead(array $row): void
{
    $dir = __DIR__ . '/log';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $file = $dir . '/leads.csv';
    $isNew = !is_file($file);
    $fp = fopen($file, 'a');
    if ($fp === false) {
        return;
    }
    if ($isNew) {
        fputcsv($fp, ['datetime', 'form_type', 'name', 'phone', 'email', 'message', 'page_url', 'ip']);
    }
    fputcsv($fp, $row);
    fclose($fp);
}

logLead([
    date('Y-m-d H:i:s'),
    $formType,
    $name,
    $phoneFormatted,
    $email,
    mb_substr($message, 0, 500),
    $pageUrl,
    $ip,
]);

/* ---------- Формирование письма ---------- */
$subjectMap = [
    'calc' => 'Заявка на расчёт стоимости отливки — сайт ЛМЗ',
    'callback' => 'Заказ обратного звонка — сайт ЛМЗ',
];
$subject = $subjectMap[$formType] ?? 'Новая заявка с сайта ЛМЗ';

$rows = [
    'Тип заявки' => $formType === 'callback' ? 'Обратный звонок' : 'Расчёт стоимости',
    'Имя' => $name,
    'Телефон' => $phoneFormatted,
];
if ($email !== '') {
    $rows['E-mail'] = $email;
}
if ($message !== '') {
    $rows['Что нужно отлить'] = $message;
}
if ($attachmentName !== null) {
    $rows['Файл'] = $attachmentName;
}
if ($pageUrl !== '') {
    $rows['Страница'] = $pageUrl;
}
foreach ($utm as $k => $v) {
    $rows[$k] = $v;
}
$rows['Дата и время (Омск)'] = date('d.m.Y H:i');
$rows['IP-адрес'] = $ip;

$htmlRows = '';
foreach ($rows as $label => $value) {
    $htmlRows .= '<tr><td style="padding:8px 12px;border-bottom:1px solid #DDE2E8;color:#57606F;font:14px Arial,sans-serif;white-space:nowrap">'
        . htmlspecialchars((string) $label, ENT_QUOTES, 'UTF-8')
        . '</td><td style="padding:8px 12px;border-bottom:1px solid #DDE2E8;font:14px Arial,sans-serif;color:#0E1218">'
        . nl2br(htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'))
        . '</td></tr>';
}

$htmlBody = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">'
    . '<div style="background:#0E1218;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">'
    . '<strong style="font-size:18px">' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</strong>'
    . '</div>'
    . '<table style="width:100%;border-collapse:collapse;background:#fff">' . $htmlRows . '</table>'
    . '<div style="padding:16px 24px;color:#8A94A6;font:12px Arial,sans-serif">Письмо сформировано автоматически на сайте ООО «ЛМЗ».</div>'
    . '</div>';

/* ---------- Отправка письма ---------- */
$sent = sendMail($config, $subject, $htmlBody, $email, $name, $attachmentPath, $attachmentName);

if (!$sent) {
    // Заявка уже залогирована в CSV — сообщаем пользователю мягко, чтобы не терять лид.
    respond(true, 'Заявка принята. Если не получите обратной связи в ближайшее время — позвоните нам, пожалуйста.');
}

respond(true, 'Спасибо! Заявка отправлена — мы свяжемся с вами в ближайшее время.');

/**
 * Отправка письма через PHPMailer (SMTP) с фолбэком на встроенную функцию mail().
 */
function sendMail(
    array $config,
    string $subject,
    string $htmlBody,
    string $replyToEmail,
    string $replyToName,
    ?string $attachmentPath,
    ?string $attachmentName
): bool {
    $toEmail = $config['to_email'] ?? '';
    if ($toEmail === '') {
        // TODO_EMAIL не заполнен клиентом — отправлять некуда, но заявка уже в mail/log/leads.csv.
        return false;
    }

    require_once __DIR__ . '/lib/PHPMailer/Exception.php';
    require_once __DIR__ . '/lib/PHPMailer/PHPMailer.php';
    require_once __DIR__ . '/lib/PHPMailer/SMTP.php';

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);

    try {
        $mail->CharSet = 'UTF-8';

        if (!empty($config['smtp']['enabled'])) {
            $mail->isSMTP();
            $mail->Host = $config['smtp']['host'];
            $mail->SMTPAuth = true;
            $mail->Username = $config['smtp']['username'];
            $mail->Password = $config['smtp']['password'];
            $mail->SMTPSecure = $config['smtp']['encryption'] ?? 'tls';
            $mail->Port = (int) ($config['smtp']['port'] ?? 587);
            $mail->SMTPDebug = (int) ($config['smtp']['debug'] ?? 0);
        } else {
            $mail->isMail();
        }

        $mail->setFrom($config['from_email'], $config['from_name'] ?? 'Сайт');
        $mail->addAddress($toEmail, $config['to_name'] ?? '');

        if ($replyToEmail !== '' && filter_var($replyToEmail, FILTER_VALIDATE_EMAIL)) {
            $mail->addReplyTo($replyToEmail, $replyToName !== '' ? $replyToName : $replyToEmail);
        }

        if ($attachmentPath !== null && $attachmentName !== null && is_file($attachmentPath)) {
            $mail->addAttachment($attachmentPath, $attachmentName);
        }

        $mail->isHTML(true);
        $mail->Subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $mail->Body = $htmlBody;
        $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $htmlBody));

        $mail->send();
        return true;
    } catch (\Throwable $e) {
        error_log('[ЛМЗ] Ошибка отправки письма: ' . $e->getMessage());
        return false;
    }
}
