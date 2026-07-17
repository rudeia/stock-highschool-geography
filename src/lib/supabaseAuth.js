import { supabase, supabaseConfigured } from './supabaseClient.js';

function getRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/?view=host-login&auth=confirmed`;
}

async function getSession() {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

async function clearAnonymousSession() {
  const session = await getSession();
  if (!session?.user?.is_anonymous) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function getCurrentAuthSession() {
  return getSession();
}

export function subscribeAuthChanges(onChange) {
  if (!supabaseConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => onChange(event, session));
  return () => data.subscription.unsubscribe();
}

export async function signUpTeacher({ email, password, displayName }) {
  if (!supabaseConfigured) throw new Error('Supabase 연결 후 회원가입을 사용할 수 있습니다.');
  await clearAnonymousSession();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getRedirectUrl(),
      data: { display_name: displayName.trim() },
    },
  });
  if (error) throw error;
  return data;
}

export async function signInTeacher({ email, password }) {
  if (!supabaseConfigured) throw new Error('Supabase 연결 후 로그인을 사용할 수 있습니다.');
  await clearAnonymousSession();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user?.is_anonymous) throw new Error('교사 계정으로 로그인해주세요.');
  return data;
}

export async function requestTeacherPasswordReset(email) {
  if (!supabaseConfigured) throw new Error('Supabase 연결 후 비밀번호를 재설정할 수 있습니다.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl() });
  if (error) throw error;
  return true;
}

export async function updateTeacherPassword(password) {
  if (!supabaseConfigured) throw new Error('Supabase 연결 후 비밀번호를 변경할 수 있습니다.');
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function signOutCurrentSession() {
  if (!supabaseConfigured) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function ensureAnonymousStudentSession() {
  if (!supabaseConfigured) return null;
  const currentSession = await getSession();
  if (currentSession?.user?.is_anonymous) return currentSession.user;
  if (currentSession) await signOutCurrentSession();

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user ?? null;
}

export function getTeacherDisplayName(user) {
  return user?.user_metadata?.display_name?.trim()
    || user?.email?.split('@')[0]
    || '교사';
}

export function isTeacherSession(session) {
  return Boolean(session?.user && !session.user.is_anonymous);
}
