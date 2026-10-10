import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Accordion } from '../../components/Accordion';
import { SignaturePad } from '../../components/SignaturePad';
import { Text } from '../../components/Text';
import { Button, Chip, Field, Loading, Row, Screen, Toggle, toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { translate } from '../../i18n/translate';
import { isoDay } from '../../models';
import type { RootScreen } from '../../navigation/types';
import type { CampBooking } from '../../services/bookingService';
import { loadCampCatalogue } from '../../services/campService';
import { db } from '../../services/firebase';
import {
  CONSENT_ITEMS,
  HealthErrors,
  HealthForm,
  checkHealthForm,
  emptyHealthForm,
  healthFormHtml,
  loadHealthForm,
  printHealthForm,
  saveHealthForm,
  saveHealthFormPdf,
} from '../../services/healthForm';
import { colors, font, radius, space } from '../../theme';

type SectionKey = 'guest' | 'doctor' | 'medical' | 'consent' | 'sign';
const SECTION_OF: Partial<Record<keyof HealthForm, SectionKey>> = {
  guestName: 'guest', dateOfBirth: 'guest', gender: 'guest', arrival: 'guest', departure: 'guest',
  doctorName: 'doctor', doctorTelephone: 'doctor',
  regularTreatment: 'medical', regularTreatmentDetails: 'medical', bringingMedication: 'medical', tetanus: 'medical',
  tetanusLastInjection: 'medical', tetanusBooster: 'medical', allergies: 'medical', allergiesDetails: 'medical', bedWetting: 'medical',
  agreement: 'consent',
  printName: 'sign', relationship: 'sign', signatureSvg: 'sign', date: 'sign',
};

/**
 * The camp health form — the same fields as Different Route's paper form (GUEST MEDICAL
 * INFORMATION). It is not needed to book or pay; parents are asked to fill it in afterwards,
 * save it as a PDF, print it and bring it to camp.
 */
export function HealthFormScreen({ route }: RootScreen<'HealthForm'>) {
  const { t, lang } = useI18n();
  const { firebaseUser } = useAuth();
  const { bookingId } = route.params;
  const [form, setForm] = useState<HealthForm | null>(null);
  const [errors, setErrors] = useState<HealthErrors>({});
  const [savedComplete, setSavedComplete] = useState(false);
  const [busy, setBusy] = useState<'save' | 'draft' | 'pdf' | 'print' | null>(null);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ guest: true, doctor: false, medical: false, consent: false, sign: false });
  const C = colors.camps;

  // An existing form, or a new one filled in from the booking (names, birth date, camp dates).
  useEffect(() => {
    if (!firebaseUser) return;
    (async () => {
      const existing = await loadHealthForm(bookingId).catch(() => null);
      if (existing) {
        setForm(existing);
        setSavedComplete(existing.complete);
        return;
      }
      const b = (await getDoc(doc(db, 'campBookings', bookingId)).catch(() => null))?.data() as CampBooking | undefined;
      const camp = b ? (await loadCampCatalogue()).find((c) => c.id === b.campId) : undefined;
      setForm(
        emptyHealthForm({
          bookingId,
          uid: firebaseUser.uid,
          campName: b?.campName ?? '',
          guestName: b ? `${b.camper.firstName} ${b.camper.lastName}` : '',
          dateOfBirth: b?.camper.birthDate ?? '',
          gender: b ? t(b.camper.gender === 'Male' ? 'booking.male' : 'booking.female') : '',
          arrival: camp?.startDate ?? '',
          departure: camp?.endDate ?? '',
          printName: b ? `${b.parent.firstName} ${b.parent.lastName}` : '',
          date: isoDay(new Date()),
        }),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, firebaseUser]);

  if (!form) {
    return (
      <Screen title={t('health.title')} accent={C}>
        <Loading />
      </Screen>
    );
  }

  const set = (patch: Partial<HealthForm>) => {
    setForm({ ...form, ...patch });
    setSavedComplete(false);
  };
  const err = (k: keyof HealthForm) => (errors[k] === 'required' ? t('auth.err.required') : errors[k] === 'date' ? t('health.dateHint') : undefined);
  const toggleSection = (k: SectionKey) => setOpen({ ...open, [k]: !open[k] });
  const html = () =>
    healthFormHtml(
      form,
      (k) => translate('en', k as TKey),
      (k) => (lang === 'en' ? '' : translate(lang, k as TKey)),
    );

  const save = async (complete: boolean) => {
    const problems = complete ? checkHealthForm(form) : {};
    setErrors(problems);
    if (Object.keys(problems).length) {
      const sections = new Set(Object.keys(problems).map((k) => SECTION_OF[k as keyof HealthForm]).filter(Boolean) as SectionKey[]);
      setOpen({ ...open, ...Object.fromEntries([...sections].map((k) => [k, true])) });
      toast(t('health.fixErrors'));
      return;
    }
    setBusy(complete ? 'save' : 'draft');
    try {
      const next = { ...form, complete };
      await saveHealthForm(next);
      setForm(next);
      setSavedComplete(complete);
      toast(t(complete ? 'health.saved' : 'health.draftSaved'));
    } catch {
      toast(t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  const output = async (kind: 'pdf' | 'print') => {
    if (!savedComplete) return toast(t('health.pdfFirst'));
    setBusy(kind);
    try {
      if (kind === 'pdf') await saveHealthFormPdf(html(), `${t('health.title')} — ${form.guestName}`);
      else await printHealthForm(html());
    } catch {
      toast(t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  const yesNo = (key: 'regularTreatment' | 'bringingMedication' | 'allergies' | 'bedWetting') => (
    <Row>
      <Chip label={t('health.yes')} color={C} selected={form[key] === 'yes'} onPress={() => set({ [key]: 'yes' } as Partial<HealthForm>)} />
      <Chip label={t('health.no')} color={C} selected={form[key] === 'no'} onPress={() => set({ [key]: 'no' } as Partial<HealthForm>)} />
    </Row>
  );
  const question = (labelKey: TKey, field: keyof HealthForm, control: React.ReactNode) => (
    <View style={{ marginBottom: space.md }}>
      <Text style={font.body}>{t(labelKey)}</Text>
      {control}
      {err(field) ? <Text style={errStyle}>{err(field)}</Text> : null}
    </View>
  );

  return (
    <Screen title={t('health.title')} subtitle={form.campName || t('health.subtitle')} accent={C}>
      <Accordion title={t('health.sectionGuest')} summary={form.guestName} icon="account-heart-outline" color={C} open={open.guest} onToggle={() => toggleSection('guest')}>
        <Field label={t('health.guestName')} value={form.guestName} onChangeText={(guestName) => set({ guestName })} error={err('guestName')} />
        <Field label={t('health.bookingRef')} value={form.bookingRef} editable={false} />
        <Field label={t('health.dateOfBirth')} placeholder={t('health.dateHint')} value={form.dateOfBirth} onChangeText={(dateOfBirth) => set({ dateOfBirth })} error={err('dateOfBirth')} keyboardType="numbers-and-punctuation" />
        <Field label={t('health.gender')} value={form.gender} onChangeText={(gender) => set({ gender })} error={err('gender')} />
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={t('health.arrival')} placeholder={t('health.dateHint')} value={form.arrival} onChangeText={(arrival) => set({ arrival })} error={err('arrival')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('health.departure')} placeholder={t('health.dateHint')} value={form.departure} onChangeText={(departure) => set({ departure })} error={err('departure')} />
          </View>
        </Row>
      </Accordion>

      <Accordion title={t('health.sectionDoctor')} summary={form.doctorName} icon="stethoscope" color={C} open={open.doctor} onToggle={() => toggleSection('doctor')}>
        <Field label={t('health.doctorName')} value={form.doctorName} onChangeText={(doctorName) => set({ doctorName })} error={err('doctorName')} />
        <Field label={t('health.doctorAddress')} value={form.doctorAddress} onChangeText={(doctorAddress) => set({ doctorAddress })} multiline />
        <Field label={t('health.doctorTelephone')} value={form.doctorTelephone} onChangeText={(doctorTelephone) => set({ doctorTelephone })} error={err('doctorTelephone')} keyboardType="phone-pad" />
      </Accordion>

      <Accordion title={t('health.sectionMedical')} icon="medical-bag" color={C} open={open.medical} onToggle={() => toggleSection('medical')}>
        {question('health.regularTreatment', 'regularTreatment', yesNo('regularTreatment'))}
        {form.regularTreatment === 'yes' ? (
          <Field label={t('health.ifYesDetails')} value={form.regularTreatmentDetails} onChangeText={(regularTreatmentDetails) => set({ regularTreatmentDetails })} error={err('regularTreatmentDetails')} multiline />
        ) : null}
        {question('health.bringingMedication', 'bringingMedication', yesNo('bringingMedication'))}
        {form.bringingMedication === 'yes' ? <Text style={[font.small, { marginTop: -space.sm, marginBottom: space.md, fontWeight: '600' }]}>{t('health.medicationNote')}</Text> : null}
        {question(
          'health.tetanus',
          'tetanus',
          <Row>
            <Chip label={t('health.yes')} color={C} selected={form.tetanus === 'yes'} onPress={() => set({ tetanus: 'yes' })} />
            <Chip label={t('health.noUnsure')} color={C} selected={form.tetanus === 'noUnsure'} onPress={() => set({ tetanus: 'noUnsure' })} />
          </Row>,
        )}
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={t('health.lastInjection')} placeholder={t('health.dateHint')} value={form.tetanusLastInjection} onChangeText={(tetanusLastInjection) => set({ tetanusLastInjection })} error={err('tetanusLastInjection')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('health.booster')} placeholder={t('health.dateHint')} value={form.tetanusBooster} onChangeText={(tetanusBooster) => set({ tetanusBooster })} error={err('tetanusBooster')} />
          </View>
        </Row>
        {question('health.allergies', 'allergies', yesNo('allergies'))}
        {form.allergies === 'yes' ? (
          <Field label={t('health.ifYesDetails')} value={form.allergiesDetails} onChangeText={(allergiesDetails) => set({ allergiesDetails })} error={err('allergiesDetails')} multiline />
        ) : null}
        {question('health.bedWetting', 'bedWetting', yesNo('bedWetting'))}
      </Accordion>

      <Accordion
        title={t('health.sectionConsent')}
        summary={`${CONSENT_ITEMS.filter((c) => form.consent[c]).length}/${CONSENT_ITEMS.length}`}
        icon="clipboard-check-outline"
        color={C}
        open={open.consent}
        onToggle={() => toggleSection('consent')}
      >
        <Text style={[font.body, { marginBottom: space.sm }]}>{t('health.consentIntro')}</Text>
        {CONSENT_ITEMS.map((c) => (
          <Toggle key={c} label={t(`health.c.${c}` as TKey)} value={form.consent[c]} onChange={(v) => set({ consent: { ...form.consent, [c]: v } })} color={C} />
        ))}
        <Text style={[font.body, { marginTop: space.md }]}>{t('health.agreement')}</Text>
        <Toggle label={t('health.agreementTick')} value={form.agreement} onChange={(agreement) => set({ agreement })} color={C} />
        {err('agreement') ? <Text style={errStyle}>{err('agreement')}</Text> : null}
      </Accordion>

      <Accordion title={t('health.sectionSign')} summary={form.printName} icon="draw-pen" color={C} open={open.sign} onToggle={() => toggleSection('sign')}>
        <Field label={t('health.printName')} value={form.printName} onChangeText={(printName) => set({ printName })} error={err('printName')} />
        <Field label={t('health.relationship')} value={form.relationship} onChangeText={(relationship) => set({ relationship })} error={err('relationship')} />
        <Text style={labelStyle}>{t('health.signed')}</Text>
        <SignaturePad onChange={(signatureSvg) => set({ signatureSvg })} placeholder={t('booking.signHere')} clearLabel={t('booking.clearSignature')} />
        {err('signatureSvg') ? <Text style={errStyle}>{err('signatureSvg')}</Text> : null}
        <Field label={t('health.date')} placeholder={t('health.dateHint')} value={form.date} onChangeText={(date) => set({ date })} error={err('date')} />
      </Accordion>

      <View style={noticeBox}>
        <MaterialCommunityIcons name="printer-outline" size={28} color={C} />
        <Text style={[font.body, { flex: 1, fontWeight: '600' }]}>{t('health.mustPrint')}</Text>
      </View>

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Button label={t('health.save')} color={C} icon="content-save-outline" loading={busy === 'save'} onPress={() => save(true)} />
        <Button label={t('health.saveDraft')} outline color={C} icon="timer-sand" loading={busy === 'draft'} onPress={() => save(false)} />
        <Button label={t('health.pdf')} outline color={C} icon="file-pdf-box" loading={busy === 'pdf'} disabled={!savedComplete} onPress={() => output('pdf')} />
        <Button label={t('health.print')} outline color={C} icon="printer" loading={busy === 'print'} disabled={!savedComplete} onPress={() => output('print')} />
      </View>
    </Screen>
  );
}

const labelStyle = { fontSize: 14, fontWeight: '500' as const, color: colors.muted, marginBottom: 6 };
const errStyle = { color: colors.danger, fontSize: 13, marginTop: 4 };
const noticeBox = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: space.md,
  backgroundColor: colors.campsSoft,
  borderRadius: radius.lg,
  padding: space.lg,
  marginTop: space.lg,
};
