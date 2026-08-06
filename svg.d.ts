/**
 * Import des .svg comme composants React.
 *
 * `react-native-svg-transformer` est bien branché dans metro.config.js, mais il
 * n'agit qu'à l'exécution : TypeScript, lui, ne savait pas ce que rend un
 * `import Logo from './logo.svg'` et refusait les props `width` / `height`
 * passées à `AppTitleSvg`. Cette déclaration comble ce seul écart, sans rien
 * changer au comportement.
 */
declare module '*.svg' {
    import type React from 'react';
    import type { SvgProps } from 'react-native-svg';
    const contenu: React.FC<SvgProps>;
    export default contenu;
}
