import { GoogleGenAI } from "@google/genai";
import { Idiom } from "../types";

// Helper to clean Markdown code blocks from JSON response
const cleanJsonOutput = (text: string): string => {
  let cleaned = text.trim();
  // Remove ```json and ``` wrappers
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '');
  }
  return cleaned.trim();
};

// Helper to validate response
const validateResponse = (response: any) => {
  if (response.text) {
    return response.text.trim();
  }
  
  // Check for safety blocks or other finish reasons
  const candidate = response.candidates?.[0];
  if (candidate?.finishReason) {
    if (candidate.finishReason !== 'STOP') {
      throw new Error(`BLOCKED_CONTENT: AI içerik filtresi (${candidate.finishReason})`);
    }
  }
  
  throw new Error("EMPTY_RESPONSE: Model boş yanıt döndürdü.");
};

const getSystemInstruction = (style: string, glossary: Record<string, string>, contextData: string = "") => {
    let stylePrompt = "Doğal, akıcı ve günlük konuşma diline uygun Türkçe kullan.";
    
    switch (style) {
        case 'netflix':
            stylePrompt = "Netflix alt yazı standartlarına uygun, kısa, öz ve deyimsel çeviri yap. Argo varsa yumuşatmadan, doğal karşılığını ver.";
            break;
        case 'anime':
            stylePrompt = "Anime jargonuna uygun, 'Nakama', 'Senpai' gibi terimlerin bağlamını koru ama Türkçe'ye uyarla. Heyecanlı ve duygusal tonu yansıt.";
            break;
        case 'documentary':
            stylePrompt = "Resmi, öğretici ve akademik bir dil kullan. Terim tutarlılığına maksimum önem ver. 'Sen' yerine 'Siz' veya edilgen çatı kullan.";
            break;
    }

    let glossaryPrompt = "";
    const terms = Object.entries(glossary);
    if (terms.length > 0) {
        glossaryPrompt = "\nÖZEL SÖZLÜK (Bu terimleri kesinlikle belirtilen şekilde kullan):\n";
        terms.forEach(([key, val]) => {
            glossaryPrompt += `- "${key}" -> "${val}"\n`;
        });
    }

    return `
    Sen profesyonel bir altyazı çevirmenisin.
    
    ÇEVİRİ TARZI: ${stylePrompt}
    ${contextData}
    ${glossaryPrompt}
    
    KURALLAR:
    1. Özel isimleri (Kişi, Yer, Marka) asla çevirme.
    2. Zaman kısıtlamalarına uy (Satır başı max 42 karakter).
    3. HTML etiketlerini (<i>, <b>) koru.
    4. Sadece çeviriyi döndür.
    `;
};

// Updated translateText to accept Context (Sliding Window)
export const translateText = async (
  text: string, 
  previousLines: string[],
  nextLines: string[],
  apiKey: string, 
  model: string,
  style: string = 'standard',
  glossary: Record<string, string> = {},
  contextData: string = ""
): Promise<string> => {
  if (!apiKey) throw new Error("API_KEY_MISSING: Çeviri API anahtarı eksik.");

  const ai = new GoogleGenAI({ apiKey });
  
  // Construct Sliding Window Prompt
  const contextBefore = previousLines.length > 0 ? `ÖNCEKİ BAĞLAM:\n${previousLines.join('\n')}\n` : "";
  const contextAfter = nextLines.length > 0 ? `\nSONRAKİ BAĞLAM:\n${nextLines.join('\n')}` : "";
  
  const prompt = `
    ${contextBefore}
    ---
    ÇEVRİLECEK METİN: "${text}"
    ---
    ${contextAfter}
    
    Sadece "ÇEVRİLECEK METİN" kısmını Türkçe'ye çevir. Bağlamı (Context) sadece anlamı doğru kurmak için kullan.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
          systemInstruction: getSystemInstruction(style, glossary, contextData),
          temperature: 0.3, // Lower temperature for consistency
      }
    });
    return validateResponse(response);
  } catch (error: any) {
    console.error("Translation error details:", error);
    throw error;
  }
};

export const translateBatch = async (
  texts: string[],
  apiKey: string,
  model: string,
  style: string = 'standard',
  glossary: Record<string, string> = {},
  contextData: string = ""
): Promise<string[]> => {
    if (!apiKey) throw new Error("API_KEY_MISSING");

    const ai = new GoogleGenAI({ apiKey });

    // Using JSON mode for reliable list processing
    const prompt = `
    Aşağıdaki İngilizce altyazı listesini sırasıyla Türkçe'ye çevir.
    
    GİRDİ (JSON):
    ${JSON.stringify(texts, null, 2)}
    
    ÇIKTI:
    Aynı uzunlukta ve sırada bir JSON dizisi (Array of strings) döndür.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: getSystemInstruction(style, glossary, contextData),
                responseMimeType: "application/json",
            }
        });
        
        const rawText = validateResponse(response);
        const jsonStr = cleanJsonOutput(rawText);
        
        let result;
        try {
            result = JSON.parse(jsonStr);
        } catch (e) {
            console.error("JSON Parse Error:", jsonStr);
            throw new Error("AI yanıtı geçerli JSON değil.");
        }
        
        if (Array.isArray(result) && result.length === texts.length) {
            return result;
        } else if (Array.isArray(result)) {
            // Mismatch length recovery attempt
            console.warn("Batch size mismatch, trying to map available results");
            return result;
        }
        
        throw new Error("Invalid batch response format");
    } catch (error) {
        console.error("Batch translation error", error);
        throw error;
    }
}

export const refineText = async (
  translatedText: string, 
  originalText: string,
  apiKey: string, 
  model: string
): Promise<string> => {
  if (!apiKey) throw new Error("API_KEY_MISSING: Editör API anahtarı eksik.");

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Görevin: Aşağıdaki Türkçe altyazı çevirisini profesyonel bir editör gibi düzelt.

    Orijinal İngilizce: "${originalText}"
    Mevcut Türkçe Çeviri: "${translatedText}"

    Kurallar:
    1. Dilbilgisi hatalarını düzelt.
    2. Anlatım bozukluklarını gider, daha akıcı hale getir.
    3. Orijinal anlama sadık kal.
    4. Altyazı okuma hızına uygun şekilde gerekirse kısalt.
    5. "Hallucination" (Uydurma) varsa sil.
    6. Sadece düzeltilmiş metni döndür, açıklama yapma.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return validateResponse(response);
  } catch (error: any) {
    console.error("Refinement error details:", error);
    throw error;
  }
};

export const extractGlossaryFromText = async (
    fullText: string,
    apiKey: string,
    model: string
): Promise<Record<string, string>> => {
    if (!apiKey) throw new Error("API Key eksik");

    const ai = new GoogleGenAI({ apiKey });
    
    // Updated Logic: Gemini 1.5/2.0 Flash has massive context.
    // We can send a huge amount of text. Let's limit to ~50k lines to be safe but allow whole episodes/seasons.
    const truncatedText = fullText.split('\n').slice(0, 50000).join('\n');

    const prompt = `
    Bu bir film/dizi altyazı projesinin metin dökümüdür.
    Görevin: Tüm bölümlerde tutarlılık sağlamak için bir "Karakter ve Terim Sözlüğü" (Glossary) oluşturmak.

    Aşağıdakileri tespit et ve JSON formatında çıkar:
    1. Karakter İsimleri (Örn: "John" -> "John") - Asla değiştirme.
    2. Rütbeler ve Unvanlar (Örn: "Commander" -> "Komutan", "Sensei" -> "Sensei") - Tutarlı olmalı.
    3. Yer İsimleri (Örn: "Winterfell" -> "Winterfell", "King's Landing" -> "King's Landing").
    4. Tekrarlanan Özel Terimler/Jargon.
    5. Hitap Şekilleri (Karakterler birbirine "Sen" mi "Siz" mi diyor? Not olarak ekle veya yansıt).

    ÇIKTI FORMATI (JSON Object):
    {
      "John": "John",
      "Commander": "Komutan",
      "Highgarden": "Highgarden",
      "You (to King)": "Siz"
    }

    METİN:
    ${truncatedText}
    `;

    try {
        const response = await ai.models.generateContent({
            model: model, // Prefer Flash or Pro with high context
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        const rawText = validateResponse(response);
        const jsonStr = cleanJsonOutput(rawText);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Glossary extraction failed", e);
        return {};
    }
}

export const analyzeIdioms = async (
    text: string,
    apiKey: string,
    model: string
): Promise<Idiom[]> => {
    if (!apiKey) throw new Error("API Key eksik");
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
    Metni analiz et, deyimleri (idioms) ve kültürel ifadeleri bul.
    Her biri için 3 farklı Türkçe çeviri seçeneği sun:
    1. literal: Kelimesi kelimesine (Komik olsa bile).
    2. localized: Türk kültüründeki tam karşılığı (Deyimsel).
    3. explanatory: Anlamı açıklayan sade çeviri.

    Eğer deyim yoksa boş dizi döndür.

    METİN: "${text}"

    ÇIKTI (JSON Array):
    [
      {
        "phrase": "Metinde geçen İngilizce deyim",
        "meaning": "Kısa İngilizce anlamı",
        "options": {
          "literal": "...",
          "localized": "...",
          "explanatory": "..."
        }
      }
    ]
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const rawText = validateResponse(response);
        const jsonStr = cleanJsonOutput(rawText);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Idiom analysis failed", e);
        return [];
    }
};