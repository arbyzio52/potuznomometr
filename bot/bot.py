"""Минимальный Telegram-бот на стандартной библиотеке Python."""
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

def load_env_file():
    """Загружает простые KEY=VALUE настройки из .env рядом с этим файлом."""
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for line_number, raw_line in enumerate(env_path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit(f"Ошибка в .env, строка {line_number}: ожидается KEY=VALUE")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '\"'):
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


load_env_file()
TOKEN = os.environ.get("BOT_TOKEN", "").strip()
WEBAPP_URL = os.environ.get("WEBAPP_URL", "").strip()


def api(method, payload=None, timeout=40):
    data = json.dumps(payload or {}).encode()
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{TOKEN}/{method}",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(details).get("description", details)
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"Telegram API вернул HTTP {error.code}: {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Не удалось подключиться к Telegram: {error.reason}") from error
    if not result.get("ok"):
        raise RuntimeError(result.get("description", "Telegram API error"))
    return result["result"]


def send_app_button(chat_id):
    keyboard = {"inline_keyboard": [[{
        "text": "Открыть потужнометр",
        "web_app": {"url": WEBAPP_URL},
    }]]}
    api("sendMessage", {
        "chat_id": chat_id,
        "text": "Привет! Открой шуточный потужнометр и запусти проверку 🔋",
        "reply_markup": keyboard,
    })


def main():
    if not TOKEN:
        raise SystemExit("Не задан BOT_TOKEN. Заполните его в файле .env рядом с bot.py.")
    if not WEBAPP_URL.startswith("https://") or "your-domain.example" in WEBAPP_URL:
        raise SystemExit("Не задан WEBAPP_URL. В .env укажите полный HTTPS адрес опубликованного сайта.")
    try:
        bot_info = api("getMe", timeout=15)
        # getUpdates не работает, если для бота ранее был установлен webhook.
        api("deleteWebhook", {"drop_pending_updates": False}, timeout=15)
    except RuntimeError as error:
        raise SystemExit(f"Не удалось запустить бота: {error}") from error
    offset = None
    print(f"Бот @{bot_info.get('username', 'unknown')} запущен. Нажмите Ctrl+C для остановки.")
    while True:
        try:
            updates = api("getUpdates", {
                "timeout": 30,
                "allowed_updates": ["message"],
                **({"offset": offset} if offset is not None else {}),
            }, timeout=35)
            for update in updates:
                offset = update["update_id"] + 1
                message = update.get("message", {})
                text = (message.get("text") or "").strip()
                if text.startswith("/") and message.get("chat", {}).get("id"):
                    send_app_button(message["chat"]["id"])
        except (TimeoutError, RuntimeError) as error:
            print(f"Ошибка Telegram API: {error}; повтор через 3 секунды")
            time.sleep(3)


if __name__ == "__main__":
    main()
