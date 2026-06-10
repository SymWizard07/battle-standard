import { Group, Image, Rect } from 'react-konva';
import type { MapTransform } from '../../lib/types';
import { useMapImage } from '../hooks/useMapImage';

interface Props {
  mapUrl?: string;
  mapTransform: MapTransform;
}

export function BackgroundLayer({ mapUrl, mapTransform }: Props) {
  const image = useMapImage(mapUrl);

  return (
    <Group
      x={mapTransform.x}
      y={mapTransform.y}
      scaleX={mapTransform.scale}
      scaleY={mapTransform.scale}
      rotation={mapTransform.rotation}
    >
      {image ? (
        <Image image={image} x={0} y={0} width={image.width} height={image.height} />
      ) : (
        <Rect x={0} y={0} width={800} height={600} fill="#334155" />
      )}
    </Group>
  );
}
