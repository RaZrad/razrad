"""Служебный скрипт проверки: делает временную копию index.html,
которая сама открывает окно pop it и лопает несколько клеток."""
import io
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'index.html')
dst = os.path.join(root, '_poptest.html')

html = io.open(src, encoding='utf-8').read()

inject = """<script>
window.addEventListener('load', function () {
  var log = [];
  var mode = new URLSearchParams(location.search).get('mode');
  setTimeout(function () {
    if (mode === 'night') document.getElementById('night').click();
    if (mode === 'halloween') document.getElementById('pumpkin').click();

    /* 1) открытие окна */
    document.getElementById('popBtn').click();
    var cells = document.querySelectorAll('.pop-cell');
    log.push('cells=' + cells.length);
    log.push('open=' + (!document.getElementById('popModal').hidden));

    /* 2) лопаем левым кликом */
    [0, 1, 33, 500, 1023].forEach(function (i) {
      cells[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    });
    log.push('popped=' + document.querySelectorAll('.pop-cell.popped').length);
    log.push('stat=' + document.getElementById('popStat').textContent);

    /* 3) клик по лопнувшей левой кнопкой — ничего не меняет */
    cells[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    log.push('afterLeftOnPopped=' + document.querySelectorAll('.pop-cell.popped').length);

    /* 4) правая кнопка — вдуть обратно */
    cells[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType: 'mouse' }));
    log.push('afterRight=' + document.querySelectorAll('.pop-cell.popped').length);
    log.push('stat2=' + document.getElementById('popStat').textContent);

    /* 5) звук */
    var a = POP_POOL[0];
    log.push('canType=' + a.canPlayType('audio/wav'));
    log.push('dur=' + a.duration);
    log.push('ready=' + a.readyState);

    /* 6) сброс */
    document.getElementById('popReset').click();
    log.push('afterReset=' + document.querySelectorAll('.pop-cell.popped').length);
    log.push('stat3=' + document.getElementById('popStat').textContent);

    /* 7) закрытие кнопкой и повторное открытие */
    document.getElementById('popClose').click();
    log.push('closed=' + document.getElementById('popModal').hidden);
    document.getElementById('popBtn').click();
    log.push('reopen=' + (!document.getElementById('popModal').hidden));

    /* 8) Esc */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    log.push('escClosed=' + document.getElementById('popModal').hidden);

    /* 9) ошибки? */
    log.push('err=' + window.__errs.join('|'));

    document.title = log.join(' ; ');
  }, 500);
});
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); });
</script>"""

marker = '<script src="script.js"></script>'
assert marker in html
html = html.replace(marker, marker + inject)

if os.environ.get('POPSHOT'):
    inject2 = """<script>
window.addEventListener('load', function () {
  var mode = new URLSearchParams(location.search).get('mode');
  setTimeout(function () {
    if (mode === 'night') document.getElementById('night').click();
    if (mode === 'halloween') document.getElementById('pumpkin').click();
    document.getElementById('popBtn').click();
    var cells = document.querySelectorAll('.pop-cell');
    /* раскладываем красиво: диагональные полосы лопнувших клеток */
    for (var i = 0; i < 1024; i++) {
      if ((i % 32) === 3 || (i % 32) === 7 || (i % 32) === 8 ||
          (i % 32) === 12 || (i % 32) === 20 || (i % 32) === 24 ||
          (i % 32) === 25 || (i % 32) === 29) {
        cells[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
      }
    }
  }, 500);
});
</script>"""
    html = html.replace(marker, marker + inject2)

io.open(dst, 'w', encoding='utf-8').write(html)
print('written', dst)