import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, I18nManager, Pressable, View } from 'react-native';
import { askForHealthForm } from './healthPrompt';
import { Text } from '../../components/Text';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SignaturePad } from '../../components/SignaturePad';
import { PressableScale } from '../../components/Accordion';
import { tintFor, useTint } from '../../components/Tint';
import { Button, Chip, Field, Loading, Row, Screen, Section, Toggle, toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { BOOKING_FORM_CAMP_OPTIONS, CampData } from '../../data/camps';
import { TERMS_TEXT } from '../../data/terms';
import { pick, useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { DEFAULT_PROVIDER, isoDay } from '../../models';
import type { RootScreen } from '../../navigation/types';
import {
  CampBooking,
  RELATIONSHIPS,
  Relationship,
  isEmail,
  isPhone,
  newBookingId,
  startGrow,
  startPaypal,
  submitBooking,
  uploadPassport,
} from '../../services/bookingService';
import { getCampPage } from '../../services/campService';
import { colors, font, radius, space } from '../../theme';

/**
 * Registration form with exactly the fields of the Different Route JotForm
 * (form.jotform.com/262433669352462), then payment by PayPal or bank transfer.
 */
export function CampBookingScreen({ route, navigation }: RootScreen<'CampBooking'>) {
  const { t, lang, price } = useI18n();
  const { firebaseUser, profile } = useAuth();
  const [camp, setCamp] = useState<CampData | null>(null);
  // A new id after a payment that couldn't start, so the next try is a fresh booking.
  const [bookingId, setBookingId] = useState(newBookingId);

  // Camper
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bDay, setBDay] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bYear, setBYear] = useState('');
  const [gradeSchool, setGradeSchool] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | ''>('');
  const [street1, setStreet1] = useState('');
  const [street2, setStreet2] = useState('');
  const [city, setCity] = useState('');
  const [stateProv, setStateProv] = useState('');
  const [postal, setPostal] = useState('');
  const [otherCampers, setOtherCampers] = useState('');
  const [camperPhone, setCamperPhone] = useState('');
  const [passport, setPassport] = useState<{ uri: string; name: string; mime: string } | null>(null);
  // Parent
  const [pFirst, setPFirst] = useState('');
  const [pLast, setPLast] = useState('');
  const [pArea, setPArea] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState(firebaseUser?.email ?? '');
  // Emergency
  const [eFirst, setEFirst] = useState('');
  const [eLast, setELast] = useState('');
  const [eArea, setEArea] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [relationship, setRelationship] = useState<Relationship | ''>('');
  const [medical, setMedical] = useState('');
  const [inhaler, setInhaler] = useState('');
  const [additional, setAdditional] = useState('');
  // Camp, terms, signature, payment
  const [campOption, setCampOption] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState('');
  // No payment method is pre-selected: each option is its own button and pressing one sends the booking.
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCampPage(route.params.campId, lang).then((r) => {
      if (!r) return;
      setCamp(r.data);
      setCampOption(r.data.bookingOption);
    });
  }, [route.params.campId, lang]);

  const birthDate = useMemo(() => {
    const d = Number(bDay);
    const m = Number(bMonth);
    const y = Number(bYear);
    if (!d || !m || !y || d > 31 || m > 12 || y < 1920 || y > new Date().getFullYear()) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }, [bDay, bMonth, bYear]);

  const req = t('booking.required');
  const errors = {
    firstName: !firstName.trim() && req,
    lastName: !lastName.trim() && req,
    birthDate: !birthDate && req,
    gender: !gender && req,
    camperPhone: (!isPhone(camperPhone) && t('booking.invalidPhone')) || '',
    passport: !passport && req,
    pFirst: !pFirst.trim() && req,
    pLast: !pLast.trim() && req,
    pPhone: (!isPhone(pPhone) && t('booking.invalidPhone')) || '',
    pEmail: (!isEmail(pEmail) && t('booking.invalidEmail')) || '',
    eFirst: !eFirst.trim() && req,
    eLast: !eLast.trim() && req,
    ePhone: (!isPhone(ePhone) && t('booking.invalidPhone')) || '',
    relationship: !relationship && req,
    medical: !medical.trim() && req,
    campOption: !campOption && req,
    accepted: !accepted && req,
    signature: !signature && req,
  };
  const show = (k: keyof typeof errors) => (submitted && errors[k] ? (errors[k] as string) : undefined);
  const valid = Object.values(errors).every((e) => !e);

  const pickPassport = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]) {
      const a = r.assets[0];
      setPassport({ uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/octet-stream' });
    }
  };

  const submit = async (method: PayMethod) => {
    if (busy) return;
    setSubmitted(true);
    if (!valid || !camp || !firebaseUser) {
      toast(t('booking.fixErrors'));
      return;
    }
    setMethod(method);
    setBusy(true);
    try {
      const passportPath = passport ? await uploadPassport(firebaseUser.uid, bookingId, passport.uri, passport.name, passport.mime) : '';
      const booking: CampBooking = {
        id: bookingId,
        uid: firebaseUser.uid,
        campId: camp.id,
        campName: pick(camp.name, 'en'),
        campOption,
        price: camp.price,
        currency: 'EUR',
        camper: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthDate: birthDate!,
          gradeSchool: gradeSchool.trim(),
          gender: gender as 'Male' | 'Female',
          address: { street1, street2, city, state: stateProv, postal },
          otherCampers: otherCampers.trim(),
          phone: camperPhone.trim(),
          passportPath,
          passportFileName: passport?.name ?? '',
        },
        parent: { firstName: pFirst.trim(), lastName: pLast.trim(), areaCode: pArea.trim(), phone: pPhone.trim(), email: pEmail.trim() },
        emergency: { firstName: eFirst.trim(), lastName: eLast.trim(), areaCode: eArea.trim(), phone: ePhone.trim(), relationship: relationship as Relationship },
        medical: medical.trim(),
        inhaler: inhaler.trim(),
        additional: additional.trim(),
        termsAccepted: true,
        signatureDate: isoDay(new Date()),
        signatureSvg: signature,
        paymentMethod: method,
        status: method === 'bank' ? 'bank_transfer_requested' : 'pending_payment',
        lang,
        createdAt: Date.now(),
      };
      await submitBooking(booking);
      if (method === 'bank') {
        askForHealthForm(navigation, t, bookingId, firstName.trim(), t('booking.healthTitle'), () => navigation.goBack(), t('booking.successBank'));
      } else if (method === 'card') {
        const { url } = await startGrow(bookingId);
        navigation.replace('Grow', { bookingId, url });
      } else {
        const { approveUrl, orderId } = await startPaypal(bookingId);
        navigation.replace('PayPal', { bookingId, approveUrl, orderId, camperName: firstName.trim() });
      }
    } catch (e) {
      setBookingId(newBookingId());
      const why = (e as { message?: string } | null)?.message ?? '';
      toast(why.includes('grow-not-configured') ? t('booking.cardNotReady') : why.includes('grow-phone') ? t('booking.cardPhone') : t('common.error'));
    } finally {
      setBusy(false);
      setMethod(null);
    }
  };

  const C = colors.camps;
  if (!camp) {
    return (
      <Screen title={t('booking.title')} accent={C}>
        <Loading />
      </Screen>
    );
  }

  // Other organisers' camps can't be booked in the app yet (the server refuses them too).
  if ((camp.provider ?? DEFAULT_PROVIDER) !== DEFAULT_PROVIDER) {
    return (
      <Screen title={t('booking.title')} accent={C}>
        <Text style={font.h2}>{pick(camp.name, lang)}</Text>
        <Text style={[font.body, { marginTop: space.md }]}>{t('camps.bookingSoon', { provider: camp.provider ?? '' })}</Text>
      </Screen>
    );
  }

  return (
    <Screen title={t('booking.title')} subtitle={t('booking.subtitle')} accent={C}>
      <Text style={font.h2}>{pick(camp.name, lang)}</Text>

      <Section title={t('booking.camperInfo')}>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={`${t('booking.firstName')} *`} value={firstName} onChangeText={setFirstName} error={show('firstName')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t('booking.lastName')} *`} value={lastName} onChangeText={setLastName} error={show('lastName')} />
          </View>
        </Row>
        <Text style={labelStyle}>{`${t('booking.birthDate')} *`}</Text>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={t('booking.day')} value={bDay} onChangeText={setBDay} keyboardType="number-pad" maxLength={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('booking.month')} value={bMonth} onChangeText={setBMonth} keyboardType="number-pad" maxLength={2} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Field label={t('booking.year')} value={bYear} onChangeText={setBYear} keyboardType="number-pad" maxLength={4} error={show('birthDate')} />
          </View>
        </Row>
        <Field label={t('booking.gradeSchool')} value={gradeSchool} onChangeText={setGradeSchool} />
        <Text style={labelStyle}>{`${t('booking.gender')} *`}</Text>
        <Row>
          <Chip label={t('booking.male')} color={C} selected={gender === 'Male'} onPress={() => setGender('Male')} />
          <Chip label={t('booking.female')} color={C} selected={gender === 'Female'} onPress={() => setGender('Female')} />
        </Row>
        {show('gender') ? <Text style={errStyle}>{show('gender')}</Text> : null}
        <Text style={[labelStyle, { marginTop: space.sm }]}>{t('booking.address')}</Text>
        <Field label={t('booking.street1')} value={street1} onChangeText={setStreet1} />
        <Field label={t('booking.street2')} value={street2} onChangeText={setStreet2} />
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={t('booking.city')} value={city} onChangeText={setCity} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('booking.state')} value={stateProv} onChangeText={setStateProv} />
          </View>
        </Row>
        <Field label={t('booking.postal')} value={postal} onChangeText={setPostal} />
        <Field label={t('booking.otherCampers')} value={otherCampers} onChangeText={setOtherCampers} multiline />
        <Field label={`${t('booking.camperPhone')} *`} value={camperPhone} onChangeText={setCamperPhone} keyboardType="phone-pad" error={show('camperPhone')} />
        <Text style={labelStyle}>{`${t('booking.passport')} *`}</Text>
        <Pressable onPress={pickPassport} style={uploadBox} accessibilityRole="button">
          <MaterialCommunityIcons name={passport ? 'file-check' : 'upload'} size={22} color={C} />
          <Text style={font.body}>{passport ? t('booking.passportChosen', { name: passport.name }) : t('booking.passportPick')}</Text>
        </Pressable>
        {show('passport') ? <Text style={errStyle}>{show('passport')}</Text> : null}
      </Section>

      <Section title={t('booking.parentInfo')}>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={`${t('booking.firstName')} *`} value={pFirst} onChangeText={setPFirst} error={show('pFirst')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t('booking.lastName')} *`} value={pLast} onChangeText={setPLast} error={show('pLast')} />
          </View>
        </Row>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={t('booking.areaCode')} value={pArea} onChangeText={setPArea} keyboardType="phone-pad" />
          </View>
          <View style={{ flex: 2.5 }}>
            <Field label={`${t('booking.phone')} *`} value={pPhone} onChangeText={setPPhone} keyboardType="phone-pad" error={show('pPhone')} />
          </View>
        </Row>
        <Field label={`${t('booking.email')} *`} value={pEmail} onChangeText={setPEmail} keyboardType="email-address" autoCapitalize="none" placeholder="example@example.com" error={show('pEmail')} />
      </Section>

      <Section title={t('booking.emergencyInfo')}>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={`${t('booking.firstName')} *`} value={eFirst} onChangeText={setEFirst} error={show('eFirst')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={`${t('booking.lastName')} *`} value={eLast} onChangeText={setELast} error={show('eLast')} />
          </View>
        </Row>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label={t('booking.areaCode')} value={eArea} onChangeText={setEArea} keyboardType="phone-pad" />
          </View>
          <View style={{ flex: 2.5 }}>
            <Field label={`${t('booking.phone')} *`} value={ePhone} onChangeText={setEPhone} keyboardType="phone-pad" error={show('ePhone')} />
          </View>
        </Row>
        <Text style={labelStyle}>{`${t('booking.relationship')} *`}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {RELATIONSHIPS.map((r) => (
            <Chip key={r} label={t(`booking.rel.${r}` as TKey)} color={C} selected={relationship === r} onPress={() => setRelationship(r)} />
          ))}
        </View>
        {show('relationship') ? <Text style={errStyle}>{show('relationship')}</Text> : null}
        <Field label={`${t('booking.medical')} *`} value={medical} onChangeText={setMedical} multiline error={show('medical')} />
        <Field label={t('booking.inhaler')} value={inhaler} onChangeText={setInhaler} multiline />
        <Field label={t('booking.additional')} value={additional} onChangeText={setAdditional} multiline />
        <Text style={labelStyle}>{`${t('booking.whichCamp')} *`}</Text>
        {BOOKING_FORM_CAMP_OPTIONS.map((o) => (
          <Toggle key={o} label={o} value={campOption === o} onChange={() => setCampOption(o)} color={C} />
        ))}
      </Section>

      <Section title={t('booking.terms')}>
        <Button small outline color={C} label={t('booking.termsShow')} icon={showTerms ? 'chevron-up' : 'chevron-down'} onPress={() => setShowTerms(!showTerms)} />
        {showTerms ? (
          <View style={termsBox}>
            <Text style={font.small}>{t('booking.termsLanguageNote')}</Text>
            <Text style={[font.small, { color: colors.text, marginTop: space.sm, writingDirection: 'ltr' }]}>{TERMS_TEXT}</Text>
          </View>
        ) : null}
        <Toggle label={`${t('booking.acceptTerms')} *`} value={accepted} onChange={setAccepted} color={C} />
        {show('accepted') ? <Text style={errStyle}>{show('accepted')}</Text> : null}
      </Section>

      <Section title={t('booking.confirmation')}>
        <Text style={font.small}>{t('booking.signatureNotice')}</Text>
        <Text style={[labelStyle, { marginTop: space.md }]}>{`${t('booking.date')}: ${isoDay(new Date())}`}</Text>
        <Text style={labelStyle}>{`${t('booking.signature')} *`}</Text>
        <SignaturePad onChange={setSignature} placeholder={t('booking.signHere')} clearLabel={t('booking.clearSignature')} />
        {show('signature') ? <Text style={errStyle}>{show('signature')}</Text> : null}
      </Section>

      <Section title={t('booking.payment')}>
        <Text style={font.h3}>{t('booking.amount', { price: price(camp.price) })}</Text>
        <Text style={[font.small, { marginBottom: space.md }]}>{t('booking.amountNote')}</Text>
        <Text style={[font.body, { marginBottom: space.md }]}>{t('booking.payChoose')}</Text>
        <PayOption icon="wallet-outline" title={t('booking.payPaypal')} info={t('booking.payPaypalInfo')} busy={busy && method === 'paypal'} disabled={busy} onPress={() => submit('paypal')} />
        <PayOption icon="credit-card-lock-outline" title={t('booking.payCard')} info={t('booking.payCardInfo')} busy={busy && method === 'card'} disabled={busy} onPress={() => submit('card')} />
        <PayOption icon="bank-transfer" title={t('booking.payBank')} info={t('booking.payBankInfo')} busy={busy && method === 'bank'} disabled={busy} onPress={() => submit('bank')} />
      </Section>
      {profile ? null : <Text style={[font.small, { marginTop: space.sm }]}>{t('common.signInRequired')}</Text>}
    </Screen>
  );
}

type PayMethod = 'paypal' | 'card' | 'bank';

/** One way to pay. All three look the same, so none of them reads as "the default". */
function PayOption({ icon, title, info, busy, disabled, onPress }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; info: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  const tint = useTint();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${title}. ${info}`}
      accessibilityState={{ busy }}
      style={[payStyle, { backgroundColor: tint.surface, borderColor: tint.line, opacity: disabled && !busy ? 0.5 : 1 }]}
    >
      <View style={[payIcon, { backgroundColor: tint.strong }]}>
        <MaterialCommunityIcons name={icon} size={26} color={tint.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{title}</Text>
        <Text style={[font.small, { marginTop: 2 }]}>{info}</Text>
      </View>
      {busy ? <ActivityIndicator color={tint.accent} /> : <MaterialCommunityIcons name="chevron-right" size={24} color={tint.accent} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />}
    </PressableScale>
  );
}

const payStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: space.md,
  minHeight: 76,
  borderWidth: 1.5,
  borderRadius: 18,
  paddingHorizontal: space.md,
  paddingVertical: space.md,
  marginBottom: space.md,
};
const payIcon = { width: 48, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const };

const labelStyle = { fontSize: 13, fontWeight: '600' as const, color: colors.muted, marginBottom: 4 };
const errStyle = { color: colors.danger, fontSize: 12, marginBottom: space.sm };
const uploadBox = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: space.sm,
  borderWidth: 1.5,
  borderStyle: 'dashed' as const,
  borderColor: colors.camps,
  borderRadius: radius.md,
  padding: space.md,
  marginBottom: space.sm,
};
const termsBox = { backgroundColor: tintFor(colors.camps).field, borderColor: tintFor(colors.camps).line, borderWidth: 1, borderRadius: radius.md, padding: space.md, marginVertical: space.sm, maxHeight: 360 };
