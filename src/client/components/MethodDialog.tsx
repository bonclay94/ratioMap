import { Modal } from './Modal';

export function MethodDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="La note, avec du recul." onClose={onClose}>
      <div className="method-content">
        <p>
          Une note de 5/5 avec deux avis est encourageante, mais moins étayée qu’une note proche
          avec des centaines d’avis. Le ratio tient compte de cette différence.
        </p>
        <div className="score-example">
          <div>
            <span>5/5 · 2 avis</span>
            <strong>
              4,08 <small>de ratio</small>
            </strong>
          </div>
          <div>
            <span>4,7/5 · 200 avis</span>
            <strong>
              4,66 <small>de ratio</small>
            </strong>
          </div>
        </div>
        <h3>Une moyenne pondérée</h3>
        <p>
          Nous ajoutons l’équivalent de 10 avis à 3,9/5 à chaque lieu. Plus un lieu a d’avis, plus
          son ratio se rapproche de sa note Google. Un lieu sans avis obtient 3,9 ; ce n’est pas une
          recommandation.
        </p>
        <code>(note × avis + 3,9 × 10) ÷ (avis + 10)</code>
        <h3>Un repère pour comparer</h3>
        <p>
          Le ratio ne vérifie pas les avis et ne garantit pas la qualité d’un établissement. Les
          résultats dépendent de la sélection de Google et ne couvrent pas forcément tous les lieux
          de la zone.
        </p>
        <p>
          Le classement ne dépend d’aucun paiement. Vous pouvez aussi trier par note, nombre d’avis
          ou distance à vol d’oiseau.
        </p>
      </div>
    </Modal>
  );
}
