/**
 * Comparaison de deux versions de gabarit.
 *
 * Découpage au mot plutôt qu'à la ligne : un prompt est un paragraphe continu,
 * et une comparaison ligne à ligne y signalerait un bloc entier modifié pour un
 * adjectif changé. Plus long diff commun, calculé sur la matrice classique.
 * Les gabarits font quelques milliers de caractères — le coût quadratique est
 * sans conséquence à cette taille, et le résultat est exact.
 */

export type Segment = { type: 'egal' | 'ajout' | 'retrait'; texte: string };

/** Conserve les séparateurs pour que le texte reconstruit soit fidèle à l'original. */
function enMots(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t !== '');
}

export function comparer(avant: string, apres: string): Segment[] {
  const a = enMots(avant);
  const b = enMots(apres);

  // Bornes : au-delà, on renonce au détail plutôt que de faire ramer l'onglet.
  if (a.length * b.length > 4_000_000) {
    return [
      { type: 'retrait', texte: avant },
      { type: 'ajout', texte: apres },
    ];
  }

  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const brut: Segment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      brut.push({ type: 'egal', texte: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      brut.push({ type: 'retrait', texte: a[i++] });
    } else {
      brut.push({ type: 'ajout', texte: b[j++] });
    }
  }
  while (i < n) brut.push({ type: 'retrait', texte: a[i++] });
  while (j < m) brut.push({ type: 'ajout', texte: b[j++] });

  // Fusion des segments contigus de même nature : sans cela, chaque mot
  // deviendrait un élément du DOM.
  const fondu: Segment[] = [];
  for (const seg of brut) {
    const dernier = fondu[fondu.length - 1];
    if (dernier && dernier.type === seg.type) dernier.texte += seg.texte;
    else fondu.push({ ...seg });
  }
  return fondu;
}

export function resumeEcart(segments: Segment[]): { ajoutes: number; retires: number } {
  let ajoutes = 0;
  let retires = 0;
  for (const s of segments) {
    const mots = s.texte.trim() === '' ? 0 : s.texte.trim().split(/\s+/).length;
    if (s.type === 'ajout') ajoutes += mots;
    if (s.type === 'retrait') retires += mots;
  }
  return { ajoutes, retires };
}
