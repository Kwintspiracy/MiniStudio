import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Filet de sécurité autour de la zone de contenu.
 *
 * Sans lui, une exception levée pendant le rendu d'une page démonte tout
 * l'arbre React : l'écran devient blanc, la barre latérale comprise, et rien
 * n'indique ce qui s'est passé. C'est exactement ce qu'a produit un
 * `ReferenceError: __DEV__ is not defined` remonté du générateur de prompts.
 *
 * Ici l'erreur reste cantonnée à la page fautive, s'affiche en clair, et la
 * navigation continue de fonctionner. Le remontage est possible sans recharger.
 */
interface Props { children: ReactNode; /** Change de valeur pour réarmer la garde. */ cle?: string }
interface State { erreur: Error | null; pile: string | null }

export class Garde extends Component<Props, State> {
  state: State = { erreur: null, pile: null };

  static getDerivedStateFromError(erreur: Error): Partial<State> {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    // Conservé pour la console : la pile de composants dit quelle page a cédé.
    console.error('[Admin] Rendu interrompu :', erreur, info.componentStack);
    this.setState({ pile: info.componentStack ?? null });
  }

  componentDidUpdate(precedent: Props) {
    // Changer de page réarme la garde : une erreur sur un écran ne doit pas
    // condamner les autres.
    if (precedent.cle !== this.props.cle && this.state.erreur) {
      this.setState({ erreur: null, pile: null });
    }
  }

  render() {
    if (!this.state.erreur) return this.props.children;

    return (
      <div className="pad">
        <div className="note bad" style={{ marginTop: 0 }}>
          <b>Cette page s'est interrompue.</b> Le reste de l'outil reste utilisable —
          choisissez un autre écran à gauche, ou réessayez.
        </div>

        <h2 className="sec">Erreur</h2>
        <pre className="apercu" style={{ maxHeight: '30vh' }}>
          {this.state.erreur.name}: {this.state.erreur.message}
        </pre>

        {this.state.pile && (
          <>
            <h2 className="sec">Où</h2>
            <pre className="apercu" style={{ maxHeight: '30vh', fontSize: 11.5 }}>
              {this.state.pile.trim()}
            </pre>
          </>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary"
                  onClick={() => this.setState({ erreur: null, pile: null })}>
            Réessayer
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
