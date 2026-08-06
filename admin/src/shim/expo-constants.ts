/**
 * Remplaçant navigateur d'expo-constants.
 *
 * src/constants.ts l'importe pour lire `expoConfig.extra`. Hors de l'application
 * mobile, rien de tel n'existe : on expose la même forme, vide. Seul le
 * générateur de prompts nous intéresse ici, et il ne consulte pas ce champ.
 */
export default { expoConfig: { extra: {} }, appOwnership: null };
