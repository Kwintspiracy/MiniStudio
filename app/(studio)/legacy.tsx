/**
 * Route de comparaison — l'ancienne expérience studio, telle qu'elle était au
 * 2026-08-07. Accessible par `/legacy`, jamais liée depuis l'interface.
 *
 * Elle existe pour qu'on puisse basculer entre l'ancienne et la nouvelle home
 * sur un même appareil, sans rebuild ni retour arrière dans git. À supprimer,
 * avec `src/legacy/StudioClassic.tsx`, une fois la refonte validée.
 */
export { default } from '@/legacy/StudioClassic';
