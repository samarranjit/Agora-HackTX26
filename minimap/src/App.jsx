import { useEffect, useRef, useState } from 'react';
import PhaserGame from './PhaserGame.jsx';

export default function App({
  mapState,
  playerPosition,
}) {
  const gameRef = useRef(null);
  const popupTimer = useRef(null);
  const previousProgress = useRef(null);

  const [mapExpanded, setMapExpanded] = useState(false);

  // Only actual progress changes trigger the expanded map.
  // Ordinary player movement does not.
  const progressKey = mapState
    ? JSON.stringify({
        completed: mapState.checkpoints
          .filter((checkpoint) => checkpoint.completed)
          .map((checkpoint) => checkpoint.id),
        unlocked: mapState.castle.unlocked,
        entered: mapState.castle.entered,
        rescued: mapState.dragonDefeated,
      })
    : null;

  const rescued = Boolean(mapState?.dragonDefeated);

  useEffect(() => {
    if (progressKey === null) {
      previousProgress.current = null;
      return;
    }

    // Remember the initial state without opening the map.
    if (previousProgress.current === null) {
      previousProgress.current = progressKey;
      return;
    }

    if (previousProgress.current === progressKey) return;

    previousProgress.current = progressKey;

    window.clearTimeout(popupTimer.current);
    setMapExpanded(true);

    popupTimer.current = window.setTimeout(() => {
      setMapExpanded(false);
    }, rescued ? 8000 : 4500);

    return () => {
      window.clearTimeout(popupTimer.current);
    };
  }, [progressKey, rescued]);

  const toggleMap = () => {
    window.clearTimeout(popupTimer.current);
    setMapExpanded((previous) => !previous);
  };

  // Wait until the main game supplies its actual level data.
  if (!mapState || !playerPosition) return null;

  return (
    <aside
      aria-label="Adventure minimap"
      style={{
        position: 'fixed',
        top: mapExpanded ? '50%' : '16px',
        right: mapExpanded ? '50%' : '16px',
        transform: mapExpanded
          ? 'translate(50%, -50%)'
          : 'none',
        width: mapExpanded
          ? 'min(820px, 90vw, 140vh)'
          : 'min(360px, calc(100vw - 32px))',
        transition:
          'width 300ms ease, top 300ms ease, right 300ms ease, transform 300ms ease',
        padding: '12px',
        borderRadius: '20px',
        background:
          'radial-gradient(ellipse at 50% 40%, rgba(46,73,68,0.78), rgba(12,25,30,0.9))',
        border: '1px solid rgba(218,192,131,0.65)',
        boxShadow:
          '0 20px 60px rgba(0,0,0,0.4), inset 0 0 30px rgba(167,204,163,0.05)',
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '6px',
        }}
      >
        <button
          type="button"
          aria-expanded={mapExpanded}
          onClick={toggleMap}
          style={{
            padding: '9px 14px',
            border: '1px solid #cbb780',
            borderRadius: '10px',
            background: '#233b3d',
            color: '#fff2ce',
            fontFamily: 'Georgia, serif',
            cursor: 'pointer',
          }}
        >
          {mapExpanded ? 'Minimize' : 'Expand'}
        </button>
      </div>

      <PhaserGame
        gameRef={gameRef}
        mapState={mapState}
        playerPosition={{
          x: playerPosition.x,
          z: playerPosition.z,
          live: true,
        }}
        expanded={mapExpanded}
      />
    </aside>
  );
}