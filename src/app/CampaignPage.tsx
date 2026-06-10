import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ScenePreviewCapture } from '../canvas/ScenePreviewCapture';
import { LayoutShell } from '../features/layout/shell/LayoutShell';
import { useCampaignAssets } from '../hooks/useCampaignAssets';
import { usePasteTokenImage } from '../hooks/usePasteTokenImage';
import { formatDocumentTitle, useDocumentTitle } from '../hooks/useDocumentTitle';
import { useGlobalAssets } from '../hooks/useGlobalAssets';
import { loadCampaign } from '../lib/db';
import { isMapAssetId } from '../lib/campaignAssets';
import { screenToGridCell } from '../lib/grid';
import { consumePendingJoin } from '../sync/sessionReconnect';
import { joinRoom, tryRestoreSession } from '../sync/syncProvider';
import { ensureTemplateTokenAsset } from '../lib/templateTokenImage';
import { useActiveScene, useStore } from '../store/useStore';

export function CampaignPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const setCampaign = useStore((s) => s.setCampaign);
  const campaign = useStore((s) => s.campaign);
  const scene = useActiveScene();
  const activeSceneId = useStore((s) => s.activeSceneId);
  const hoveredTokenId = useStore((s) => s.hoveredTokenId);
  const scale = useStore((s) => s.scale);
  const stageX = useStore((s) => s.x);
  const stageY = useStore((s) => s.y);
  const addToken = useStore((s) => s.addToken);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const registerAssetUrl = useStore((s) => s.registerAssetUrl);
  const roomCode = useStore((s) => s.roomCode);
  const [joinFailedMessage, setJoinFailedMessage] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0, show: false });
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  usePasteTokenImage(activeSceneId, mapWrapRef);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  useCampaignAssets(campaignId);
  useGlobalAssets();

  useDocumentTitle(
    campaign
      ? formatDocumentTitle(
          scene?.name,
          campaign.name,
          roomCode ? `Room ${roomCode}` : null,
        )
      : formatDocumentTitle('Loading…'),
  );

  useEffect(() => {
    if (!campaignId) return;
    let alive = true;
    void loadCampaign(campaignId).then((c) => {
      if (alive && c) {
        setCampaign(c);
        const pending = consumePendingJoin(campaignId);
        if (pending) {
          void joinRoom(pending.roomCode, pending.playerName).then((result) => {
            if (!result.ok) setJoinFailedMessage(result.error);
          });
        } else {
          tryRestoreSession(campaignId);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [campaignId, setCampaign]);

  useEffect(() => {
    if (!hoveredTokenId || !scene) {
      setTooltip((t) => ({ ...t, show: false }));
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      return;
    }
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setTooltip({ x: 0, y: 0, show: true });
    }, 1000);
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, [hoveredTokenId, scene]);

  const hoveredToken =
    hoveredTokenId && scene
      ? scene.tokens.find((t) => t.id === hoveredTokenId)
      : null;

  const onMapDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!activeSceneId || !scene || !mapWrapRef.current || !campaign) return;

    const rect = mapWrapRef.current.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const cell = screenToGridCell(screen, { x: stageX, y: stageY }, scale);
    const name = e.dataTransfer.getData('token-name') || 'Token';

    const assetId = e.dataTransfer.getData('token-asset-id');
    if (assetId) {
      if (isMapAssetId(assetId, campaign)) return;
      addToken(activeSceneId, {
        name: name.replace(/\.[^.]+$/, ''),
        imageAssetId: assetId,
        gridPos: cell,
      });
      return;
    }

    const templateColor = e.dataTransfer.getData('token-template-color');
    if (templateColor) {
      void ensureTemplateTokenAsset(campaign.id, templateColor, registerAssetUrl).then(
        (templateAssetId) => {
          addToken(activeSceneId!, {
            name: name.replace(/\.[^.]+$/, ''),
            imageAssetId: templateAssetId,
            color: templateColor,
            gridPos: cell,
          });
        },
      );
      return;
    }

    const color = e.dataTransfer.getData('token-color');
    if (color) {
      let footprint: { w: number; h: number } | undefined;
      const footprintRaw = e.dataTransfer.getData('token-footprint');
      if (footprintRaw) {
        try {
          footprint = JSON.parse(footprintRaw) as { w: number; h: number };
        } catch {
          footprint = undefined;
        }
      }
      addToken(activeSceneId, {
        name: name.replace(/\.[^.]+$/, ''),
        color,
        gridPos: cell,
        footprint,
      });
    }
  };

  if (!campaign) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-row">
      <ScenePreviewCapture />
      <LayoutShell
        mapWrapRef={mapWrapRef}
        onMapDrop={onMapDrop}
        joinFailedMessage={joinFailedMessage}
        hoveredTokenEffects={hoveredToken?.statusEffects}
        tooltipVisible={tooltip.show}
      />
    </div>
  );
}
