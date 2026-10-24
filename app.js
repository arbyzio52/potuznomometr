const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
tg?.setHeaderColor?.('#090a0b');
tg?.setBackgroundColor?.('#090a0b');

const meter = document.querySelector('#meter');
const valueOutput = document.querySelector('#value');
const statusText = document.querySelector('#status-text');
const mood = document.querySelector('#mood');
const checkButton = document.querySelector('#check');
const settingsButton = document.querySelector('#settings');
const barCount = 20;
const bars = Array.from({ length: barCount }, (_, i) => {
  const bar = document.createElement('span');
  bar.className = 'bar';
  bar.style.setProperty('--n', i / (barCount - 1));
  meter.append(bar);
  return bar;
});

function paint(value) {
  const lit = Math.round(value / 100 * barCount);
  bars.forEach((bar, i) => bar.classList.toggle('active', i < lit));
  valueOutput.value = value;
  valueOutput.textContent = value;
  mood.textContent = value < 35 ? '😌' : value < 70 ? '😎' : '🤯';
}

checkButton.addEventListener('click', () => {
  if (checkButton.disabled) return;
  checkButton.disabled = true;
  checkButton.textContent = 'ИЗМЕРЯЕМ…';
  statusText.textContent = 'ИДЁТ ПРОВЕРКА';
  bars.forEach(bar => bar.classList.add('active'));
  let ticks = 0;
  const animation = window.setInterval(() => {
    paint(Math.floor(Math.random() * 101));
    ticks += 1;
    if (ticks >= 12) {
      window.clearInterval(animation);
      const result = Math.floor(Math.random() * 101);
      paint(result);
      statusText.textContent = result < 35 ? 'ПОТУЖНОСТЬ УМЕРЕННАЯ' : result < 70 ? 'ПОТУЖНОСТЬ ВЫСОКАЯ' : 'ПОТУЖНОСТЬ МАКСИМАЛЬНАЯ';
      checkButton.disabled = false;
      checkButton.textContent = 'ПРОВЕРИТЬ ЕЩЁ';
    }
  }, 110);
});

settingsButton.addEventListener('click', () => {
  const message = 'потужно мометр - новая разработка украини';
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
});
