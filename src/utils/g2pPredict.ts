/**
 * G2P neural predictor port for browser Web Worker.
 */

let _model: any = null;

function b64ToFloat32(b64str: string): Float32Array {
  const binaryString = atob(b64str);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

function reshape2D(flat: Float32Array, rows: number, cols: number): Float32Array[] {
  const result: Float32Array[] = [];
  for (let i = 0; i < rows; i++) {
    result.push(flat.subarray(i * cols, (i + 1) * cols));
  }
  return result;
}

export async function loadG2PModel() {
  if (_model) return _model;
  
  try {
    const res = await fetch('/models/g2p_model.json');
    if (!res.ok) throw new Error('g2p_model.json not found');
    const raw = await res.json();
    
    const m: any = {};
    for (const name of ['enc_emb','enc_w_ih','enc_w_hh','enc_b_ih','enc_b_hh',
                         'dec_emb','dec_w_ih','dec_w_hh','dec_b_ih','dec_b_hh',
                         'fc_w','fc_b']) {
      const { shape, data } = raw[name];
      const flat = b64ToFloat32(data);
      if (shape.length === 2) {
        m[name] = reshape2D(flat, shape[0], shape[1]);
        m[name + '_shape'] = shape;
      } else {
        m[name] = flat;
      }
    }
    
    m.graphemes = raw.graphemes;
    m.phonemes = raw.phonemes;
    m.g2idx = {};
    for (let i = 0; i < raw.graphemes.length; i++) m.g2idx[raw.graphemes[i]] = i;
    m.idx2p = {};
    for (let i = 0; i < raw.phonemes.length; i++) m.idx2p[i] = raw.phonemes[i];
    m.homograph2features = raw.homograph2features || {};
    
    _model = m;
    return m;
  } catch (e) {
    console.warn('[g2p_predict] g2p_model.json failed to load:', e);
    return null;
  }
}

function gruCell(x: Float32Array, h: Float32Array, w_ih: Float32Array[], w_hh: Float32Array[], b_ih: Float32Array, b_hh: Float32Array, hiddenDim: number) {
  const dim3 = hiddenDim * 3;
  const rzn_ih = new Float32Array(dim3);
  for (let i = 0; i < dim3; i++) {
    let sum = b_ih[i];
    const row = w_ih[i];
    for (let j = 0; j < x.length; j++) sum += x[j] * row[j];
    rzn_ih[i] = sum;
  }
  const rzn_hh = new Float32Array(dim3);
  for (let i = 0; i < dim3; i++) {
    let sum = b_hh[i];
    const row = w_hh[i];
    for (let j = 0; j < h.length; j++) sum += h[j] * row[j];
    rzn_hh[i] = sum;
  }
  const dim2 = hiddenDim * 2;
  const rz = new Float32Array(dim2);
  for (let i = 0; i < dim2; i++) {
    rz[i] = 1 / (1 + Math.exp(-(rzn_ih[i] + rzn_hh[i])));
  }
  const r = rz.subarray(0, hiddenDim);
  const z = rz.subarray(hiddenDim, dim2);
  const newH = new Float32Array(hiddenDim);
  for (let i = 0; i < hiddenDim; i++) {
    const n = Math.tanh(rzn_ih[dim2 + i] + r[i] * rzn_hh[dim2 + i]);
    newH[i] = (1 - z[i]) * n + z[i] * h[i];
  }
  return newH;
}

function gruEncode(embeds: Float32Array[], steps: number, w_ih: Float32Array[], w_hh: Float32Array[], b_ih: Float32Array, b_hh: Float32Array, hiddenDim: number) {
  let h = new Float32Array(hiddenDim);
  for (let t = 0; t < steps; t++) {
    h = gruCell(embeds[t], h, w_ih, w_hh, b_ih, b_hh, hiddenDim);
  }
  return h;
}

export function predictG2P(word: string) {
  const m = _model;
  if (!m) return null;
  const hiddenDim = m.enc_w_hh_shape[1];
  const chars = word.split('').concat(['</s>']);
  const encInput = chars.map(ch => {
    const idx = m.g2idx[ch] !== undefined ? m.g2idx[ch] : m.g2idx['<unk>'];
    return m.enc_emb[idx];
  });
  const lastHidden = gruEncode(encInput, chars.length, m.enc_w_ih, m.enc_w_hh, m.enc_b_ih, m.enc_b_hh, hiddenDim);
  let dec = m.dec_emb[2];
  let h = lastHidden;
  const preds: string[] = [];
  for (let i = 0; i < 20; i++) {
    h = gruCell(dec, h, m.dec_w_ih, m.dec_w_hh, m.dec_b_ih, m.dec_b_hh, hiddenDim);
    let maxVal = -Infinity, maxIdx = 0;
    for (let j = 0; j < m.fc_w.length; j++) {
      let logit = m.fc_b[j];
      const row = m.fc_w[j];
      for (let k = 0; k < hiddenDim; k++) logit += h[k] * row[k];
      if (logit > maxVal) { maxVal = logit; maxIdx = j; }
    }
    if (maxIdx === 3) break;
    preds.push(m.idx2p[maxIdx] || '<unk>');
    dec = m.dec_emb[maxIdx];
  }
  return preds;
}
