import { predictG2P, loadG2PModel } from './g2pPredict';

const SYMBOLS = ["_","\"","(",")","*","/",":","AA","E","EE","En","N","OO","Q","V","[","\\","]","^","a","a:","aa","ae","ah","ai","an","ang","ao","aw","ay","b","by","c","ch","d","dh","dy","e","e:","eh","ei","en","eng","er","ey","f","g","gy","h","hh","hy","i","i0","i:","ia","ian","iang","iao","ie","ih","in","ing","iong","ir","iu","iy","j","jh","k","ky","l","m","my","n","ng","ny","o","o:","ong","ou","ow","oy","p","py","q","r","ry","s","sh","t","th","ts","ty","u","u:","ua","uai","uan","uang","uh","ui","un","uo","uw","v","van","ve","vn","w","x","y","z","zh","zy","~","\u00e6","\u00e7","\u00f0","\u00f8","\u014b","\u0153","\u0250","\u0251","\u0252","\u0254","\u0255","\u0259","\u025b","\u025c","\u0261","\u0263","\u0265","\u0266","\u026a","\u026b","\u026c","\u026d","\u026f","\u0272","\u0275","\u0278","\u0279","\u027e","\u0281","\u0283","\u028a","\u028c","\u028e","\u028f","\u0291","\u0292","\u029d","\u02b2","\u02c8","\u02cc","\u02d0","\u0303","\u0329","\u03b2","\u03b8","\u1100","\u1101","\u1102","\u1103","\u1104","\u1105","\u1106","\u1107","\u1108","\u1109","\u110a","\u110b","\u110c","\u110d","\u110e","\u110f","\u1110","\u1111","\u1112","\u1161","\u1162","\u1163","\u1164","\u1165","\u1166","\u1167","\u1168","\u1169","\u116a","\u116b","\u116c","\u116d","\u116e","\u116f","\u1170","\u1171","\u1172","\u1173","\u1174","\u1175","\u11a8","\u11ab","\u11ae","\u11af","\u11b7","\u11b8","\u11bc","\u3138","!","?","\u2026",",",".","'","-","\u00bf","\u00a1","SP","UNK"];
const SYM: Record<string, number> = {};
for (let i = 0; i < SYMBOLS.length; i++) SYM[SYMBOLS[i]] = i;

const LANG_ID = 2;
const TONE_OFFSET = 7;

let CMU: Record<string, any> = {};

export async function loadTokenizerModels() {
  await loadG2PModel();
  
  try {
    const res = await fetch('/models/cmudict.json');
    if (res.ok) {
      CMU = await res.json();
    }
  } catch (e) {
    console.warn('[ttsTokenizer] Failed to load cmudict.json, using fallback');
  }

  if (Object.keys(CMU).length === 0) {
    const _fb = {"THE":["DH","AH0"],"A":["AH0"],"AN":["AE1","N"],"AND":["AE1","N","D"],"I":["AY1"],"YOU":["Y","UW1"],"YOUR":["Y","ER1"],"HE":["HH","IY1"],"SHE":["SH","IY1"],"IT":["IH1","T"],"IS":["IH1","Z"],"ARE":["AA1","R"],"WAS":["W","AA1","Z"],"WERE":["W","ER1"],"BE":["B","IY1"],"BEEN":["B","IH1","N"],"HAVE":["HH","AE1","V"],"HAS":["HH","AE1","Z"],"HAD":["HH","AE1","D"],"DO":["D","UW1"],"DOES":["D","AH1","Z"],"DID":["D","IH1","D"],"WILL":["W","IH1","L"],"WOULD":["W","UH1","D"],"CAN":["K","AE1","N"],"COULD":["K","UH1","D"],"SHOULD":["SH","UH1","D"],"OF":["AH0","V"],"FOR":["F","ER1"],"TO":["T","UW0"],"IN":["IH1","N"],"ON":["AA1","N"],"AT":["AE1","T"],"BY":["B","AY1"],"WITH":["W","IH1","DH"],"THIS":["DH","IH1","S"],"THAT":["DH","AE1","T"],"NOT":["N","AA1","T"],"BUT":["B","AH1","T"],"OR":["ER1"],"IF":["IH1","F"],"SO":["S","OW1"],"NO":["N","OW1"],"YES":["Y","EH1","S"],"HELLO":["HH","AH0","L","OW1"],"WORLD":["W","ER1","L","D"],"GOOD":["G","UH1","D"],"FROM":["F","R","AH0","M"],"THEY":["DH","EY1"],"THEIR":["DH","ER1"],"THERE":["DH","ER1"],"WHAT":["W","AA1","T"],"WHEN":["W","EH1","N"],"HOW":["HH","AW1"],"WHO":["HH","UW1"]};
    Object.assign(CMU, _fb);
  }
}

function _parsePhone(phn: string): [string, number] {
  const m = phn.match(/(\d)$/);
  if (m) return [phn.slice(0,-1).toLowerCase(), parseInt(m[1])+1];
  return [phn.toLowerCase(), 0];
}

function _parseSyllables(syllables: any[]): [string[], number[]] {
  const phones: string[] = [], tones: number[] = [];
  for (const syl of syllables) {
    for (const phn of syl) {
      const [ph, tone] = _parsePhone(phn);
      phones.push(ph); tones.push(tone);
    }
  }
  return [phones, tones];
}

function _mapPhoneme(ph: string): string {
  const rep: Record<string, string> = {'\uFF1A':',','\uFF1B':',','\uFF0C':',','\u3002':'.',
    '\uFF01':'!','\uFF1F':'?','\n':'.','\xB7':',',
    '\u3001':',','...':'\u2026','v':'V'};
  if (rep[ph] !== undefined) return rep[ph];
  if (SYM[ph] !== undefined) return ph;
  return 'UNK';
}

function graphemeToPhoneme(text: string) {
  text = text.toLowerCase().trim();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const allPhones: string[] = [], allTones: number[] = [], word2ph: number[] = [];

  for (const word of words) {
    const leadMatch = word.match(/^[^a-z0-9]*/);
    const lead = leadMatch ? leadMatch[0] : '';
    const trailMatch = word.match(/[^a-z0-9']*$/);
    const trail = trailMatch ? trailMatch[0] : '';
    const core = word.slice(lead.length, word.length - trail.length);

    for (const ch of lead) {
      allPhones.push(_mapPhoneme(ch)); allTones.push(0); word2ph.push(1);
    }

    if (core.length > 0) {
      let resolved = false;
      if (core.includes("'")) {
          const parts = core.split("'");
          const allPartPhones: string[] = [], allPartTones: number[] = [];
          let allFound = true;
          for (let pi = 0; pi < parts.length; pi++) {
            const part = parts[pi];
            if (pi > 0) {
              allPartPhones.push("'");
              allPartTones.push(0);
            }
            if (part.length === 0) continue;
            const pUpper = part.toUpperCase();
            if (CMU[pUpper]) {
              const [ph, tn] = _parseSyllables([CMU[pUpper]]);
              allPartPhones.push(...ph);
              allPartTones.push(...tn);
            } else {
              const partPreds = predictG2P(part);
              if (partPreds && partPreds.length > 0) {
                for (const phn of partPreds) {
                  const [ph2, tn2] = _parsePhone(phn);
                  allPartPhones.push(ph2);
                  allPartTones.push(tn2);
                }
              } else {
                allFound = false;
                break;
              }
            }
          }
          if (allFound && allPartPhones.length > 0) {
            for (const p of allPartPhones) allPhones.push(_mapPhoneme(p));
            allTones.push(...allPartTones);
            word2ph.push(allPartPhones.length);
            resolved = true;
          }
        }
        if (!resolved) {
          const upper = core.toUpperCase();
          if (CMU[upper]) {
            const [phones, tones] = _parseSyllables([CMU[upper]]);
            for (const p of phones) allPhones.push(_mapPhoneme(p));
            allTones.push(...tones);
            word2ph.push(phones.length);
            resolved = true;
          }
        }
        if (!resolved) {
          const neuralPreds = predictG2P(core);
          if (neuralPreds && neuralPreds.length > 0) {
            const [ph, tn] = _parseSyllables([neuralPreds]);
            for (const p of ph) allPhones.push(_mapPhoneme(p));
            allTones.push(...tn);
            word2ph.push(ph.length);
          } else {
            for (const ch of core) {
              if (ch === "'") continue;
              allPhones.push(ch.toLowerCase());
              allTones.push(0);
            }
            word2ph.push(core.replace(/'/g, '').length);
          }
        }
    }

    for (const ch of trail) {
      allPhones.push(_mapPhoneme(ch)); allTones.push(0); word2ph.push(1);
    }
  }

  allPhones.unshift('_'); allPhones.push('_');
  allTones.unshift(0); allTones.push(0);
  word2ph.unshift(1); word2ph.push(1);

  return { phones: allPhones, tones: allTones, word2ph };
}

function phonemesToIds(phones: string[], tones: number[]) {
  const phoneIds = phones.map(p => SYM[p] !== undefined ? SYM[p] : SYM['UNK']);
  const toneIds = tones.map(t => t + TONE_OFFSET);
  const langIds = new Array(phoneIds.length).fill(LANG_ID);
  return [phoneIds, toneIds, langIds];
}

export function textToPhonemeIds(text: string) {
  const { phones, tones } = graphemeToPhoneme(text);
  const [phoneIds, toneIds, langIds] = phonemesToIds(phones, tones);

  const n = phoneIds.length;
  const pb = new Array(n * 2 + 1).fill(0);
  const tb = new Array(n * 2 + 1).fill(0);
  const lb = new Array(n * 2 + 1).fill(0);
  for (let i = 0; i < n; i++) {
    pb[1 + i * 2] = phoneIds[i];
    tb[1 + i * 2] = toneIds[i];
    lb[1 + i * 2] = langIds[i];
  }
  return { phoneIds: pb, toneIds: tb, langIds: lb };
}
