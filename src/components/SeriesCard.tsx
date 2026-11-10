import { useCallback, useMemo, useState } from "react";
import { ContentCard } from "./ContentCard";
import { useCachedQuery } from "../lib/queries";
import { getSeriesInfo, type Account, type SeriesInfo, type SeriesItem, imageCandidates } from "../lib/xtream";

interface SeriesCardProps {
  account: Account;
  cacheKey: string;
  series: SeriesItem;
  search?: Record<string, string>;
}

export function SeriesCard({ account, cacheKey, series, search }: SeriesCardProps) {
  const initialImages = useMemo(() => {
    return [
      series.cover,
      series.cover_big,
      series.movie_image,
      series.stream_icon,
      series.poster_path,
      series.image,
    ].filter(Boolean);
  }, [series]);

  const [needsDetails, setNeedsDetails] = useState(initialImages.length === 0);
  const details = useCachedQuery(
    `${cacheKey}:seriesinfo:${series.series_id}:cover`,
    () => getSeriesInfo(account, series.series_id),
    { enabled: needsDetails, maxAgeMs: 24 * 60 * 60 * 1000 },
  );

  const handleImageUnavailable = useCallback(() => {
    setNeedsDetails(true);
  }, []);

  const allImages = useMemo(() => {
    const images = [...initialImages];
    if (details.data) {
      images.push(details.data.info?.cover);
      for (const episodes of Object.values(details.data.episodes ?? {})) {
        const image = episodes.find((ep) => ep.info?.movie_image)?.info?.movie_image;
        if (image) images.push(image);
      }
    }
    return images.filter((img) => img && img.trim());
  }, [initialImages, details.data]);

  return (
    <ContentCard
      to="/series/$id"
      params={{ id: String(series.series_id) }}
      search={search}
      title={series.name}
      image={allImages[0]}
      fallbackImage={allImages.slice(1).join("|")}
      rating={series.rating}
      onImageUnavailable={handleImageUnavailable}
    />
  );
}
