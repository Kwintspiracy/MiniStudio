import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Préparation de l'image source avant envoi au modèle.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Le sélecteur d'images et la caméra réduisaient chacun de leur côté à
 * **1024 px de large, JPEG à 70 %**, après une première passe à 80 % à la prise
 * de vue. Deux compressions destructrices, et un plafond de 1024 px.
 *
 * Le banc d'essais, lui, téléverse la photo **telle quelle** à PoYo. C'est le
 * seul écart de fond entre les deux chemins : payload identique par ailleurs,
 * même `size: '1:1'`, prompts du même ordre de grandeur, et sortie 1024×1024
 * des deux côtés. D'où l'hypothèse — l'écart de qualité entre Standard et Pro
 * se voit au banc et pas dans l'application parce que l'application détruit
 * l'information avant que le modèle ne la voie. Un modèle de retouche lit le
 * détail fin de l'entrée ; sur une source déjà écrasée, le modèle cher n'a rien
 * de plus à exploiter que le modèle bon marché.
 *
 * Sur une photo de téléphone de 12 Mpx (4032 × 3024), un plafond à 1024 px de
 * large ne conserve que **6,4 % des pixels**. C'est de l'arithmétique, pas une
 * estimation.
 *
 * CE QUI CONTRAINT LA HAUSSE
 *
 * La charge part en base64 dans le corps de la requête, ce qui l'alourdit d'un
 * tiers, et `geminiService` avertit au-delà de 6 Mo. On vise donc largement
 * en dessous, avec un repli automatique plutôt qu'un pari sur la taille des
 * photos : c'est la seule façon de monter la qualité sans risquer un échec
 * réseau sur les appareils qui photographient en très haute définition.
 */

/** Palier de qualité, du meilleur au plus prudent. */
const PALIERS = [
    { width: 2048, compress: 0.92 },
    { width: 1536, compress: 0.88 },
    { width: 1024, compress: 0.8 },
] as const;

/**
 * Plafond visé pour le fichier encodé, avant base64.
 * 3,5 Mo de JPEG donnent ~4,7 Mo de base64, sous la limite de 6 Mo avec marge.
 */
const OCTETS_MAX = 3.5 * 1024 * 1024;

async function tailleFichier(uri: string): Promise<number> {
    if (Platform.OS === 'web') {
        try {
            const r = await fetch(uri);
            return (await r.blob()).size;
        } catch {
            return 0; // Indéterminable : on accepte le palier plutôt que de dégrader à l'aveugle.
        }
    }
    try {
        const info = await FileSystem.getInfoAsync(uri);
        return info.exists && 'size' in info ? (info.size ?? 0) : 0;
    } catch {
        return 0;
    }
}

/**
 * Réduit une image source au meilleur palier qui tienne dans la limite de
 * charge. Renvoie l'URI du fichier préparé.
 *
 * On ne redimensionne jamais vers le HAUT : `resize({ width })` d'expo agrandit
 * si la source est plus petite, ce qui ajouterait des pixels sans information et
 * gonflerait la charge pour rien.
 */
export async function preparerImageSource(uri: string): Promise<string> {
    let largeurSource = 0;
    try {
        const sonde = await ImageManipulator.manipulate(uri).renderAsync();
        largeurSource = sonde.width ?? 0;
    } catch {
        largeurSource = 0;
    }

    let dernier = uri;
    for (const palier of PALIERS) {
        const largeur = largeurSource > 0 ? Math.min(palier.width, largeurSource) : palier.width;
        const rendu = await ImageManipulator.manipulate(uri).resize({ width: largeur }).renderAsync();
        const sortie = await rendu.saveAsync({ compress: palier.compress, format: SaveFormat.JPEG });
        dernier = sortie.uri;

        const octets = await tailleFichier(sortie.uri);
        if (octets === 0 || octets <= OCTETS_MAX) return sortie.uri;
        // Trop lourd : on redescend d'un palier plutôt que de risquer un échec
        // réseau à l'envoi.
    }
    return dernier;
}
