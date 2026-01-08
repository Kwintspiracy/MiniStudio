import { Redirect } from 'expo-router';

export default function GoogleAuthRedirect() {
  console.log("[AUTH] Redirection route '/google-auth' hit.");
  // This route exists to handle the redirect path 'google-auth'
  // It simply redirects back to the main index, while AuthContext listens for the deep link.
  return <Redirect href="/" />;
}
