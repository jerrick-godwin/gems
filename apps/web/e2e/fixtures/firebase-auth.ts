// Test-only transport, aliased exclusively by admin-test-server.ts.
const listeners = new Map<object, Set<(user: unknown) => void>>();
const auths = new Map<string, {name:string;currentUser:any}>();
const testUser = (name: string) => ({ uid: name === 'admin' ? 'admin-test' : 'int-user-1', email: name === 'admin' ? 'admin@example.invalid' : 'test1@example.invalid', displayName:'Test User 1', getIdToken:async()=>name === 'admin' ? 'test-admin' : 'test-user' });
export function getAuth(app?: {name:string}) {
  const name = app?.name ?? '[DEFAULT]';
  if (!auths.has(name)) auths.set(name,{name,currentUser:sessionStorage.getItem(`test-auth-${name}`) ? testUser(name) : null});
  return auths.get(name)!;
}
export function onIdTokenChanged(auth:ReturnType<typeof getAuth>,callback:(user:any)=>void) {
  const set = listeners.get(auth) ?? new Set(); set.add(callback); listeners.set(auth,set);
  queueMicrotask(()=>{if(set.has(callback))callback(auth.currentUser);});
  return ()=>set.delete(callback);
}
export const onAuthStateChanged=onIdTokenChanged;
export async function signInWithEmailAndPassword(auth:ReturnType<typeof getAuth>,_email:string,password:string) {
  if(password !== 'test-password') throw new Error('Invalid credentials');
  auth.currentUser=testUser(auth.name);sessionStorage.setItem(`test-auth-${auth.name}`,'1');listeners.get(auth)?.forEach(callback=>callback(auth.currentUser));return {user:auth.currentUser};
}
export async function signOut(auth:ReturnType<typeof getAuth>) {auth.currentUser=null;sessionStorage.removeItem(`test-auth-${auth.name}`);listeners.get(auth)?.forEach(callback=>callback(null));}
export const browserSessionPersistence={};
export async function setPersistence() {}
export async function signInWithCustomToken(auth:ReturnType<typeof getAuth>) {return signInWithEmailAndPassword(auth,'','test-password');}
export const createUserWithEmailAndPassword=signInWithEmailAndPassword;
export async function sendPasswordResetEmail() {}
export async function confirmPasswordReset() {}
export async function updateProfile() {}
