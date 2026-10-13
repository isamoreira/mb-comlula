<?php
// Contador anônimo de compartilhamentos do Espalha Hoje (roda na própria Hostinger).
//
//   POST contador.php?acao=hit              corpo {"postId":"...","network":"..."}  → 204 (soma 1)
//   GET  contador.php?acao=hoje             → {"dia":"AAAA-MM-DD","total":N}
//   GET  contador.php?acao=numeros&dias=7   → números por rede, por post e por dia (público)
//
// Privacidade: não lê nem grava IP, cookie ou qualquer identificador.
// Só guarda (dia, post, rede, contagem).
//
// Os dados ficam FORA da public_html (pasta "espalha-hoje-dados" ao lado dela), para não
// serem apagados quando o site.zip é extraído. Se não der, ficam em api/dados (protegida).

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
date_default_timezone_set('America/Sao_Paulo');

const REDES = ['whatsapp', 'telegram', 'x', 'threads', 'facebook', 'reddit', 'instagram', 'tiktok', 'kwai', 'nativo'];
const RE_POST = '/^\d{4}-\d{2}-\d{2}-[\w-]{1,40}$/';

function responder($dados, int $status = 200): void
{
    http_response_code($status);
    if ($dados !== null) {
        echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    exit;
}

function hoje(): string
{
    return date('Y-m-d');
}

// Pasta gravável para os dados (de preferência fora da public_html).
function pastaDados(): string
{
    $candidatas = [dirname(__DIR__, 2) . '/espalha-hoje-dados', __DIR__ . '/dados'];
    foreach ($candidatas as $pasta) {
        if ((is_dir($pasta) || @mkdir($pasta, 0700, true)) && is_writable($pasta)) {
            if (basename($pasta) === 'dados' && !file_exists($pasta . '/.htaccess')) {
                @file_put_contents(
                    $pasta . '/.htaccess',
                    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n"
                );
            }
            return $pasta;
        }
    }
    responder(['erro' => 'sem pasta gravável para os dados'], 500);
}

// ---------------------------------------------------------------------------
// Armazenamento: SQLite (padrão) ou, se não houver, um arquivo JSON com trava.
// ---------------------------------------------------------------------------

function banco(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        return $pdo = null;
    }
    $pdo = new PDO('sqlite:' . pastaDados() . '/contador.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS shares (
        day TEXT NOT NULL, post_id TEXT NOT NULL, network TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, post_id, network))');
    return $pdo;
}

// Incremento atômico: dois cliques ao mesmo tempo não se perdem.
function incrementar(string $dia, string $post, string $rede): void
{
    $pdo = banco();
    if ($pdo) {
        $pdo->prepare('INSERT INTO shares (day, post_id, network, n) VALUES (?, ?, ?, 1)
            ON CONFLICT(day, post_id, network) DO UPDATE SET n = n + 1')->execute([$dia, $post, $rede]);
        return;
    }
    $arq = fopen(pastaDados() . '/contador.json', 'c+');
    flock($arq, LOCK_EX);
    $dados = json_decode(stream_get_contents($arq) ?: '{}', true) ?: [];
    $chave = "$dia|$post|$rede";
    $dados[$chave] = ($dados[$chave] ?? 0) + 1;
    ftruncate($arq, 0);
    rewind($arq);
    fwrite($arq, json_encode($dados));
    fflush($arq);
    flock($arq, LOCK_UN);
    fclose($arq);
}

// Linhas [dia, post, rede, n] a partir de uma data.
function linhasDesde(string $desde): array
{
    $pdo = banco();
    if ($pdo) {
        $st = $pdo->prepare('SELECT day, post_id, network, n FROM shares WHERE day >= ? ORDER BY day DESC, post_id, network');
        $st->execute([$desde]);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    }
    $arquivo = pastaDados() . '/contador.json';
    $dados = is_file($arquivo) ? (json_decode((string) file_get_contents($arquivo), true) ?: []) : [];
    $linhas = [];
    foreach ($dados as $chave => $n) {
        [$dia, $post, $rede] = explode('|', $chave);
        if ($dia >= $desde) {
            $linhas[] = ['day' => $dia, 'post_id' => $post, 'network' => $rede, 'n' => $n];
        }
    }
    return $linhas;
}

// Só conta posts que existem no site (evita lixo no contador).
function postExiste(string $id): bool
{
    $arquivo = __DIR__ . '/../data/posts.json';
    if (!is_file($arquivo)) {
        return false;
    }
    foreach (json_decode((string) file_get_contents($arquivo), true) ?: [] as $p) {
        if (($p['id'] ?? '') === $id) {
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

$acao = $_GET['acao'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($acao === 'hit' && $metodo === 'POST') {
        $corpo = (string) file_get_contents('php://input', false, null, 0, 1024);
        $dados = json_decode($corpo, true);
        $post = is_array($dados) ? (string) ($dados['postId'] ?? '') : '';
        $rede = is_array($dados) ? (string) ($dados['network'] ?? '') : '';
        if (!preg_match(RE_POST, $post) || !in_array($rede, REDES, true) || !postExiste($post)) {
            responder(['erro' => 'postId ou network inválido'], 400);
        }
        incrementar(hoje(), $post, $rede);
        responder(null, 204);
    }

    if ($acao === 'hoje' && $metodo === 'GET') {
        $total = 0;
        foreach (linhasDesde(hoje()) as $l) {
            if ($l['day'] === hoje()) {
                $total += (int) $l['n'];
            }
        }
        responder(['dia' => hoje(), 'total' => $total]);
    }

    if ($acao === 'numeros' && $metodo === 'GET') {
        $dias = max(1, min(366, (int) ($_GET['dias'] ?? 7)));
        $desde = date('Y-m-d', strtotime('-' . ($dias - 1) . ' days'));
        $porRede = [];
        $porDia = [];
        $porPost = [];
        $total = 0;
        foreach (linhasDesde($desde) as $l) {
            $n = (int) $l['n'];
            $total += $n;
            $porRede[$l['network']] = ($porRede[$l['network']] ?? 0) + $n;
            $porDia[$l['day']] = ($porDia[$l['day']] ?? 0) + $n;
            $p = $porPost[$l['post_id']] ?? ['post_id' => $l['post_id'], 'total' => 0, 'redes' => []];
            $p['total'] += $n;
            $p['redes'][$l['network']] = ($p['redes'][$l['network']] ?? 0) + $n;
            $porPost[$l['post_id']] = $p;
        }
        arsort($porRede);
        krsort($porDia);
        $porPost = array_values($porPost);
        usort($porPost, fn($a, $b) => $b['total'] <=> $a['total']);
        responder([
            'desde' => $desde,
            'ate' => hoje(),
            'total' => $total,
            'hoje' => $porDia[hoje()] ?? 0,
            'por_rede' => (object) $porRede,
            'por_dia' => (object) $porDia,
            'por_post' => $porPost,
        ]);
    }

    responder(['erro' => 'não encontrado'], 404);
} catch (Throwable $e) {
    responder(['erro' => 'erro interno'], 500);
}
