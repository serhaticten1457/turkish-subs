import { TMDBContext } from "../types";

const BASE_URL = "https://api.themoviedb.org/3";

export const searchTMDB = async (query: string, apiKey: string): Promise<TMDBContext | null> => {
    if (!query || !apiKey) return null;

    try {
        // 1. Search for Multi (Movie or TV)
        const searchRes = await fetch(`${BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=tr-TR`);
        const searchData = await searchRes.json();

        if (!searchData.results || searchData.results.length === 0) return null;

        const bestMatch = searchData.results[0]; // Take the first result
        const type = bestMatch.media_type === 'tv' ? 'tv' : 'movie';
        const id = bestMatch.id;

        // 2. Get Details (with Credits)
        const detailsRes = await fetch(`${BASE_URL}/${type}/${id}?api_key=${apiKey}&language=tr-TR&append_to_response=credits`);
        const details = await detailsRes.json();

        // 3. Extract Cast Names
        const cast = details.credits?.cast?.slice(0, 10).map((c: any) => `${c.character} (${c.name})`) || [];
        
        // 4. Extract Genres
        const genres = details.genres?.map((g: any) => g.name) || [];

        return {
            id: details.id,
            title: details.title || details.name,
            original_title: details.original_title || details.original_name,
            overview: details.overview,
            release_date: details.release_date || details.first_air_date,
            genres,
            cast
        };

    } catch (error) {
        console.error("TMDB Error:", error);
        return null;
    }
};

export const formatTMDBContext = (context: TMDBContext): string => {
    return `
    BAĞLAM BİLGİSİ (FILM/DIZI):
    - Başlık: ${context.title} (${context.original_title})
    - Tür: ${context.genres.join(', ')}
    - Konu: ${context.overview}
    - Önemli Karakterler: ${context.cast.join(', ')}
    
    Bu bağlamı çevirinin tonunu ve kelime seçimlerini belirlemek için kullan.
    `;
};