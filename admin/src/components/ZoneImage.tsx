import { useCallback, useEffect, useRef, useState } from 'react';

export interface ImageChoisie {
  apercu: string;
  base64: string;
  mime: string;
  nom: string;
  octets: number;
}

interface Props {
  valeur: ImageChoisie | null;
  onChange: (i: ImageChoisie | null) => void;
  /** Désactive le collage quand plusieurs zones coexistent à l'écran. */
  collage?: boolean;
}

/**
 * Dépôt d'image : glisser-déposer, clic, ou collage.
 *
 * Le collage mérite d'être là. Sur ce banc on compare des rendus, et l'essentiel
 * du va-et-vient consiste à capturer une figurine à l'écran puis à la déposer —
 * passer par un fichier intermédiaire pour cela est une corvée gratuite.
 */
export function ZoneImage({ valeur, onChange, collage = true }: Props) {
  const [survol, setSurvol] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  // Compteur plutôt que booléen : dragleave se déclenche aussi en passant d'un
  // enfant à l'autre, et un simple booléen ferait clignoter la zone.
  const profondeur = useRef(0);

  const accepter = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setRefus(`« ${f.name} » n'est pas une image.`);
      return;
    }
    setRefus(null);
    const l = new FileReader();
    l.onload = () => {
      const url = String(l.result);
      onChange({
        apercu: url,
        base64: url.split(',')[1] ?? '',
        mime: f.type,
        nom: f.name || 'presse-papiers',
        octets: f.size,
      });
    };
    l.readAsDataURL(f);
  }, [onChange]);

  useEffect(() => {
    if (!collage) return;
    const auCollage = (e: ClipboardEvent) => {
      // Ne pas voler le collage d'une zone de saisie : on tape aussi des prompts.
      const cible = e.target as HTMLElement | null;
      if (cible && /^(INPUT|TEXTAREA)$/.test(cible.tagName)) return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); accepter(item.getAsFile()); }
    };
    window.addEventListener('paste', auCollage);
    return () => window.removeEventListener('paste', auCollage);
  }, [collage, accepter]);

  const poids = (o: number) =>
    o > 1048576 ? `${(o / 1048576).toFixed(1)} Mo` : `${Math.round(o / 1024)} Ko`;

  if (valeur) {
    return (
      <div className="zi-remplie">
        <img src={valeur.apercu} alt={valeur.nom} />
        <div className="zi-pied">
          <span className="zi-nom" title={valeur.nom}>{valeur.nom}</span>
          <span className="zi-poids">{poids(valeur.octets)}</span>
          <button className="btn ghost sm" onClick={() => champ.current?.click()}>Remplacer</button>
          <button className="btn ghost sm" onClick={() => onChange(null)}>Retirer</button>
        </div>
        <input ref={champ} type="file" accept="image/*" hidden
               onChange={(e) => accepter(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`zi${survol ? ' survol' : ''}`}
        onClick={() => champ.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); profondeur.current++; setSurvol(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          profondeur.current--;
          if (profondeur.current <= 0) { profondeur.current = 0; setSurvol(false); }
        }}
        onDrop={(e) => {
          e.preventDefault();
          profondeur.current = 0;
          setSurvol(false);
          accepter(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="zi-icone" aria-hidden>⤓</span>
        <span className="zi-titre">Déposez une figurine</span>
        <span className="zi-aide">
          ou cliquez pour choisir{collage && <>, ou collez avec <kbd>Ctrl</kbd>+<kbd>V</kbd></>}
        </span>
      </button>
      {refus && <div className="note bad" style={{ marginTop: 10 }}>{refus}</div>}
      <input ref={champ} type="file" accept="image/*" hidden
             onChange={(e) => accepter(e.target.files?.[0])} />
    </>
  );
}
