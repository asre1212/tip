(function () {
  const VERSION = '1.2.0';
  let busy = false;

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function addStyles() {
    if (document.getElementById('receiptAutofillStyles')) return;
    const style = document.createElement('style');
    style.id = 'receiptAutofillStyles';
    style.textContent = `
      .receipt-actions{display:flex;align-items:center;gap:10px;padding:14px}
      .receipt-btn{flex:1;min-height:48px;border:none;border-radius:12px;background:#1C1C1E;color:#FFFFFF;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;-webkit-appearance:none;transition:all .15s ease}
      .receipt-btn.secondary{flex:0 0 auto;min-width:92px;background:#F2F2F7;color:#1C1C1E}
      .receipt-btn:disabled{opacity:.55;cursor:default}
      .receipt-btn:not(:disabled):active{opacity:.85;transform:scale(.98)}
      .receipt-status{border-top:1px solid #F2F2F7;color:#8E8E93;font-size:13px;line-height:1.35;min-height:44px;padding:11px 16px}
      .receipt-status.success{color:#248A3D}
      .receipt-status.error{color:#FF3B30}
      .receipt-preview{display:none;width:calc(100% - 28px);max-height:140px;object-fit:cover;border-radius:12px;margin:0 14px 14px;background:#F2F2F7}
    `;
    document.head.appendChild(style);
  }

  function setStatus(text, kind) {
    const el = document.getElementById('receiptStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('success', kind === 'success');
    el.classList.toggle('error', kind === 'error');
  }

  function setInputAmount(id, value) {
    if (!Number.isFinite(value) || value < 0) return false;
    const input = document.getElementById(id);
    if (!input) return false;
    input.value = value.toFixed(2);
    return true;
  }

  function findLastAmount(line) {
    const matches = [...line.matchAll(/(?:[$S]\s*)?(-?\d{1,4}(?:[,.]\d{2}))/g)]
      .map(match => parseFloat(match[1].replace(',', '.')))
      .filter(value => Number.isFinite(value) && value >= 0 && value < 10000);
    return matches.length ? matches[matches.length - 1] : null;
  }

  function findLabeledAmount(lines, include, exclude) {
    for (const line of lines) {
      if (!include.test(line)) continue;
      if (exclude && exclude.test(line)) continue;
      const amount = findLastAmount(line);
      if (amount != null) return amount;
    }
    return null;
  }

  function parseReceiptText(text) {
    const lines = text
      .split(/\r?\n/)
      .map(line => line.toLowerCase().replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const pretax = findLabeledAmount(
      lines,
      /\b(sub\s?total|pre[-\s]?tax|net sales|food total|items total)\b/,
      /\b(tax|suggested|tip|gratuity)\b/
    );
    const tax = findLabeledAmount(
      lines,
      /\b(tax|sales tax|state tax|local tax)\b/,
      /\b(sub\s?total|total|suggested|tip)\b/
    );
    const servicefee = findLabeledAmount(
      lines,
      /\b(service fee|service charge|auto grat|automatic gratuity|gratuity)\b/,
      /\b(suggested|tip)\b/
    );
    const miscfee = findLabeledAmount(
      lines,
      /\b(convenience fee|processing fee|delivery fee|surcharge|admin fee|misc(?:ellaneous)? fee)\b/,
      /\b(service|tax|tip|suggested)\b/
    );
    const total = findLabeledAmount(
      lines.slice().reverse(),
      /\b(total|amount due|balance due|paid)\b/,
      /\b(sub\s?total|tax|tip|change|cash|card|visa|mastercard|suggested)\b/
    );

    const result = { pretax, tax, servicefee, miscfee, total };
    if (result.pretax == null && result.total != null) {
      const knownFees = (result.tax || 0) + (result.servicefee || 0) + (result.miscfee || 0);
      if (result.total > knownFees) result.pretax = result.total - knownFees;
    }
    return result;
  }

  function applyReceiptFields(fields) {
    let filled = 0;
    if (setInputAmount('pretax', fields.pretax)) filled++;
    if (setInputAmount('tax', fields.tax)) filled++;
    if (setInputAmount('servicefee', fields.servicefee)) filled++;
    if (setInputAmount('miscfee', fields.miscfee)) filled++;
    if (typeof window.calculate === 'function') window.calculate();
    return filled;
  }

  async function loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return window.Tesseract;
  }

  async function readReceiptText(file) {
    if ('TextDetector' in window) {
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new TextDetector();
        const detected = await detector.detect(bitmap);
        if (detected && detected.length) return detected.map(item => item.rawValue).join('\n');
      } catch (e) {
        /* Fall through to Tesseract. */
      }
    }

    const tesseract = await loadTesseract();
    const result = await tesseract.recognize(file, 'eng', {
      logger(progress) {
        if (progress.status === 'recognizing text' && progress.progress) {
          setStatus(`Reading receipt ${Math.round(progress.progress * 100)}%...`);
        }
      }
    });
    return result.data.text || '';
  }

  async function handleReceiptImage(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || busy) return;

    busy = true;
    const scanBtn = document.getElementById('receiptScanBtn');
    if (scanBtn) scanBtn.disabled = true;
    setStatus('Reading receipt...');

    const preview = document.getElementById('receiptPreview');
    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    }

    try {
      const text = await readReceiptText(file);
      const fields = parseReceiptText(text);
      const filled = applyReceiptFields(fields);
      if (filled) {
        const names = [
          fields.pretax != null ? 'pre-tax' : null,
          fields.tax != null ? 'tax' : null,
          fields.servicefee != null ? 'service fee' : null,
          fields.miscfee != null ? 'misc. fee' : null
        ].filter(Boolean).join(', ');
        setStatus(`Filled ${names}. Check the numbers before paying.`, 'success');
      } else {
        setStatus('Could not find bill amounts. Try a clearer, flatter photo.', 'error');
      }
    } catch (e) {
      setStatus('Text recognition is unavailable. Try again when online or enter details manually.', 'error');
    } finally {
      busy = false;
      if (scanBtn) scanBtn.disabled = false;
    }
  }

  function mountReceiptCard() {
    if (document.getElementById('receiptAutofillCard')) return;
    addStyles();

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'receiptAutofillCard';
    card.innerHTML = `
      <div class="card-title">Receipt Autofill</div>
      <input type="file" id="receiptImage" accept="image/*" style="display:none;" />
      <div class="receipt-actions">
        <button class="receipt-btn" id="receiptScanBtn" type="button">Scan Receipt</button>
        <button class="receipt-btn secondary" id="receiptClearBtn" type="button">Clear</button>
      </div>
      <img class="receipt-preview" id="receiptPreview" alt="" />
      <div class="receipt-status" id="receiptStatus">Choose a receipt photo to fill bill details.</div>
    `;

    const container = document.querySelector('.container');
    if (!container) return;
    container.insertBefore(card, container.firstElementChild);

    const input = document.getElementById('receiptImage');
    document.getElementById('receiptScanBtn').addEventListener('click', () => {
      if (!busy) input.click();
    });
    document.getElementById('receiptClearBtn').addEventListener('click', () => {
      input.value = '';
      const preview = document.getElementById('receiptPreview');
      preview.removeAttribute('src');
      preview.style.display = 'none';
      setStatus('Choose a receipt photo to fill bill details.');
    });
    input.addEventListener('change', handleReceiptImage);

    const versionLine = document.querySelector('#versionLine b');
    if (versionLine) versionLine.textContent = `v${VERSION}`;
  }

  onReady(mountReceiptCard);
}());
