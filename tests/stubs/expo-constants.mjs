/**
 * Doublure d'`expo-constants` pour les tests hors runtime Expo.
 * `src/constants.ts` l'importe pour lire les clés RevenueCat ; le générateur de
 * prompt n'en a aucun besoin, mais l'import entraîne toute la chaîne
 * expo-modules-core, qui n'est pas exécutable sous Node.
 */
export default { expoConfig: { extra: {} } };
