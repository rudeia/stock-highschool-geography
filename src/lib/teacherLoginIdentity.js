const EASTER_EGG_LOGIN_PATTERN = /^geography(?:[1-9]|1\d|20)?$/;
const EASTER_EGG_EMAIL_DOMAIN = 'easteregg.example.com';

export function isEasterEggTeacherId(value) {
  return EASTER_EGG_LOGIN_PATTERN.test(String(value ?? '').trim().toLowerCase());
}

export function normalizeTeacherLoginIdentifier(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return isEasterEggTeacherId(normalized)
    ? `${normalized}@${EASTER_EGG_EMAIL_DOMAIN}`
    : normalized;
}
