/**
 * The camp health form ("GUEST MEDICAL INFORMATION", Different Route's Medical_Form_DR_G.pdf):
 * exactly the paper form's fields, the checks the app makes before saving, and the printable
 * page (A4) that becomes the PDF parents print and bring to camp. No React Native here, so the
 * tests can run it.
 */

export type YesNo = 'yes' | 'no' | '';
export type YesNoUnsure = 'yes' | 'noUnsure' | '';

/** The 14 consent boxes, in the form's three columns, top to bottom. */
export const CONSENT_COLUMNS = [
  ['adhesivePlasters', 'antiAllergySyrup', 'antihistamineCream', 'antisepticSprayWipes', 'burnCream'],
  ['calamineLotion', 'calpol', 'facePaints', 'headLiceLotion', 'ibuprofen'],
  ['insectBiteCream', 'lipBalm', 'paracetamol', 'sunCream'],
] as const;
export type ConsentItem = (typeof CONSENT_COLUMNS)[number][number];
export const CONSENT_ITEMS: ConsentItem[] = CONSENT_COLUMNS.flat() as ConsentItem[];

export interface HealthForm {
  bookingId: string;
  uid: string;
  campName: string;
  // Guest medical information
  guestName: string;
  bookingRef: string;
  dateOfBirth: string;
  gender: string;
  arrival: string;
  departure: string;
  // Doctor
  doctorName: string;
  doctorAddress: string;
  doctorTelephone: string;
  // Questions
  regularTreatment: YesNo;
  regularTreatmentDetails: string;
  bringingMedication: YesNo;
  tetanus: YesNoUnsure;
  tetanusLastInjection: string;
  tetanusBooster: string;
  allergies: YesNo;
  allergiesDetails: string;
  bedWetting: YesNo;
  // Consent
  consent: Record<ConsentItem, boolean>;
  agreement: boolean;
  // Signature
  printName: string;
  relationship: string;
  signatureSvg: string;
  date: string;
  complete: boolean;
  updatedAt: number;
}

export function emptyHealthForm(p: Partial<HealthForm> & { bookingId: string; uid: string }): HealthForm {
  return {
    campName: '',
    guestName: '',
    bookingRef: p.bookingId,
    dateOfBirth: '',
    gender: '',
    arrival: '',
    departure: '',
    doctorName: '',
    doctorAddress: '',
    doctorTelephone: '',
    regularTreatment: '',
    regularTreatmentDetails: '',
    bringingMedication: '',
    tetanus: '',
    tetanusLastInjection: '',
    tetanusBooster: '',
    allergies: '',
    allergiesDetails: '',
    bedWetting: '',
    consent: Object.fromEntries(CONSENT_ITEMS.map((c) => [c, false])) as Record<ConsentItem, boolean>,
    agreement: false,
    printName: '',
    relationship: '',
    signatureSvg: '',
    date: '',
    complete: false,
    updatedAt: 0,
    ...p,
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export type HealthErrors = Partial<Record<keyof HealthForm, 'required' | 'date'>>;

/** What's missing before the form counts as filled in. Consent boxes are optional, as on paper. */
export function checkHealthForm(f: HealthForm): HealthErrors {
  const e: HealthErrors = {};
  const need = (k: keyof HealthForm, ok: boolean) => {
    if (!ok) e[k] = 'required';
  };
  const date = (k: keyof HealthForm, v: string, required: boolean) => {
    if (!v.trim()) {
      if (required) e[k] = 'required';
    } else if (!DATE.test(v.trim())) e[k] = 'date';
  };
  need('guestName', !!f.guestName.trim());
  date('dateOfBirth', f.dateOfBirth, true);
  need('gender', !!f.gender.trim());
  date('arrival', f.arrival, true);
  date('departure', f.departure, true);
  need('doctorName', !!f.doctorName.trim());
  need('doctorTelephone', !!f.doctorTelephone.trim());
  need('regularTreatment', !!f.regularTreatment);
  if (f.regularTreatment === 'yes') need('regularTreatmentDetails', !!f.regularTreatmentDetails.trim());
  need('bringingMedication', !!f.bringingMedication);
  need('tetanus', !!f.tetanus);
  if (f.tetanus === 'yes') date('tetanusLastInjection', f.tetanusLastInjection, true);
  date('tetanusBooster', f.tetanusBooster, false);
  need('allergies', !!f.allergies);
  if (f.allergies === 'yes') need('allergiesDetails', !!f.allergiesDetails.trim());
  need('bedWetting', !!f.bedWetting);
  need('agreement', f.agreement);
  need('printName', !!f.printName.trim());
  need('relationship', !!f.relationship.trim());
  need('signatureSvg', !!f.signatureSvg.trim());
  date('date', f.date, true);
  return e;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safePath = (p: string) => p.replace(/[^MLQCZmlqcz0-9.,\s-]/g, '');

/**
 * The printable form. Labels are the paper form's English wording; when the app is in Hebrew
 * or Russian, the translation is printed small underneath (`tr(key)` returns it, or '' for English).
 */
export function healthFormHtml(f: HealthForm, en: (key: string) => string, tr: (key: string) => string): string {
  const L = (key: string) => {
    const t = tr(key);
    return `${esc(en(key))}${t ? `<span class="tr" dir="auto">${esc(t)}</span>` : ''}`;
  };
  const row = (key: string, value: string) => `<tr><td class="label">${L(key)}</td><td colspan="3">${esc(value)}</td></tr>`;
  const box = (on: boolean) => `<span class="box">${on ? '&#10004;' : ''}</span>`;
  const yesNo = (key: string, v: string, noKey = 'health.no', noValue = 'no') =>
    `<tr><td colspan="2">${L(key)}</td><td class="yn">${box(v === 'yes')} ${L('health.yes')}</td><td class="yn">${box(v === noValue)} ${L(noKey)}</td></tr>`;
  const details = (v: string) => `<tr><td colspan="4" class="details">${L('health.ifYesDetails')}<div class="answer">${esc(v)}</div></td></tr>`;
  const consentCols = CONSENT_COLUMNS.map(
    (col) => `<td class="col">${col.map((c) => `<div class="citem">${box(f.consent[c])} ${L(`health.c.${c}`)}</div>`).join('')}</td>`,
  ).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(en('health.sectionGuest'))} — ${esc(f.guestName)}</title><style>
@page { size: A4; margin: 12mm; }
body { font-family: Arial, 'Noto Sans', 'Noto Sans Hebrew', sans-serif; font-size: 10.5pt; color: #111; }
h1 { text-align: center; font-size: 14pt; margin: 0; padding: 5px; border: 1px solid #000; border-bottom: none; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
td.label { width: 30%; }
td.yn { width: 14%; text-align: center; white-space: nowrap; }
td.details .answer { min-height: 28px; margin-top: 3px; }
.tr { display: block; font-size: 8pt; color: #555; }
.box { display: inline-block; width: 13px; height: 13px; border: 1px solid #000; text-align: center; line-height: 13px; font-size: 10pt; vertical-align: middle; }
.note { font-weight: bold; text-align: center; font-size: 9.5pt; }
.consent td { border: none; } .consent { border: 1px solid #000; }
.col { width: 33%; } .citem { margin: 3px 0; }
.sig td { border: none; padding: 6px 4px; } .line { border-bottom: 1px dotted #000; min-width: 160px; display: inline-block; padding: 0 4px; }
.bring { margin-top: 14px; border: 2px solid #000; padding: 8px; text-align: center; font-weight: bold; font-size: 11pt; }
</style></head><body>
<h1>${esc(en('health.sectionGuest'))}</h1>
<table>
${row('health.guestName', f.guestName)}
${row('health.bookingRef', f.bookingRef)}
${row('health.dateOfBirth', f.dateOfBirth)}
${row('health.gender', f.gender)}
${row('health.arrival', f.arrival)}
${row('health.departure', f.departure)}
</table>
<table>
${row('health.doctorName', f.doctorName)}
${row('health.doctorAddress', f.doctorAddress)}
${row('health.doctorTelephone', f.doctorTelephone)}
</table>
<table>
${yesNo('health.regularTreatment', f.regularTreatment)}
${details(f.regularTreatmentDetails)}
${yesNo('health.bringingMedication', f.bringingMedication)}
<tr><td colspan="4" class="note">${L('health.medicationNote')}</td></tr>
${yesNo('health.tetanus', f.tetanus, 'health.noUnsure', 'noUnsure')}
<tr><td>${L('health.lastInjection')}</td><td>${esc(f.tetanusLastInjection)}</td><td>${L('health.booster')}</td><td>${esc(f.tetanusBooster)}</td></tr>
${yesNo('health.allergies', f.allergies)}
${details(f.allergiesDetails)}
${yesNo('health.bedWetting', f.bedWetting)}
</table>
<table class="consent"><tr><td colspan="3">${L('health.consentIntro')}</td></tr><tr>${consentCols}</tr>
<tr><td colspan="3"><p>${L('health.agreement')}</p>${L('health.agreementTick')} ${box(f.agreement)}</td></tr></table>
<table class="sig">
<tr><td>${L('health.printName')}: <span class="line">${esc(f.printName)}</span></td><td>${L('health.relationship')}: <span class="line">${esc(f.relationship)}</span></td></tr>
<tr><td>${L('health.signed')}: ${f.signatureSvg ? `<svg viewBox="0 0 600 200" width="210" height="70"><path d="${safePath(f.signatureSvg)}" fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '<span class="line"></span>'}</td><td>${L('health.date')}: <span class="line">${esc(f.date)}</span></td></tr>
</table>
<div class="bring">${L('health.mustPrint')}</div>
</body></html>`;
}
