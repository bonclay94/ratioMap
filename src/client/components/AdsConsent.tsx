import { useEffect, useState } from 'react';
import type { PublicConfig } from '../../shared/types';

const KEY = 'ratiomap-ad-consent';
function savedConsent() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function AdsConsent({ config }: { config: PublicConfig | null }) {
  const [consent, setConsent] = useState(savedConsent);
  const [settings, setSettings] = useState(false);
  const configured = Boolean(config?.adsenseClientId && config.adsenseSlotId);
  useEffect(() => {
    if (!configured || consent !== 'accepted' || !config) return;
    const slot = document.getElementById('ad-slot');
    if (!slot || slot.childElementCount) return;
    const ad = document.createElement('ins');
    ad.className = 'adsbygoogle';
    ad.style.display = 'block';
    ad.dataset.adClient = config.adsenseClientId!;
    ad.dataset.adSlot = config.adsenseSlotId!;
    ad.dataset.adFormat = 'auto';
    ad.dataset.fullWidthResponsive = 'true';
    slot.appendChild(ad);
    slot.hidden = false;
    const script = document.createElement('script');
    script.id = 'adsense-loader';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.adsenseClientId!)}`;
    script.onload = () => {
      const target = window as Window & { adsbygoogle?: object[] };
      (target.adsbygoogle ||= []).push({});
    };
    if (!document.getElementById(script.id)) document.head.appendChild(script);
  }, [configured, consent, config]);
  if (!configured) return null;
  function choose(value: string) {
    const revoke = consent === 'accepted' && value !== 'accepted';
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* The choice still applies for this page. */
    }
    setConsent(value);
    setSettings(false);
    if (revoke) window.location.reload();
  }
  return (
    <>
      <button className="consent-settings" type="button" onClick={() => setSettings(true)}>
        Préférences publicitaires
      </button>
      {(!consent || settings) && (
        <section className="cookie-consent" aria-labelledby="consent-title">
          <h2 id="consent-title">Un choix pour votre confidentialité</h2>
          <p>
            Acceptez-vous les cookies publicitaires Google AdSense ? Vous pouvez refuser et utiliser
            toutes les fonctionnalités. <a href="/privacy.html">En savoir plus</a>
          </p>
          <div>
            <button className="secondary-button" type="button" onClick={() => choose('declined')}>
              Refuser
            </button>
            <button className="secondary-button" type="button" onClick={() => choose('accepted')}>
              Accepter
            </button>
          </div>
        </section>
      )}
    </>
  );
}
