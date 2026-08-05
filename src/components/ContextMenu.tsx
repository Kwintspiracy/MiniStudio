import React from 'react';
import Constants from 'expo-constants';
import { MenuView } from '@react-native-menu/menu';

/**
 * Menu contextuel natif, avec repli.
 *
 * `@react-native-menu/menu` est un module natif : Expo Go ne l'embarque pas.
 * Sans repli, React rend une boîte « Unimplemented component: <MenuView> » à sa
 * place — et comme le menu est parfois posé en `absoluteFillObject` par-dessus
 * une vignette, cette boîte recouvre l'image. La galerie devenait illisible en
 * développement.
 *
 * Ici, quand le module est absent, on rend simplement les enfants. Le menu long-
 * press disparaît, mais tout le reste — vignettes, appuis simples, boutons de
 * secours — continue de fonctionner. Sur un build natif, rien ne change.
 */
const NATIVE_MENU_AVAILABLE = Constants.appOwnership !== 'expo';

type ContextMenuProps = React.ComponentProps<typeof MenuView>;

export const ContextMenu: React.FC<ContextMenuProps> = (props) => {
  if (!NATIVE_MENU_AVAILABLE) {
    return <>{props.children}</>;
  }
  return <MenuView {...props} />;
};

/** Permet de conditionner une interface de secours au même endroit. */
export const isNativeMenuAvailable = NATIVE_MENU_AVAILABLE;
