export interface WeatherData {
  temperature: number;
  tempUnit: 'c' | 'f';
  weatherCode: number;
  weatherText: string;
  weatherEmoji: string;
  isDay: boolean;
  windSpeed?: number;
  city?: string;
  fetchedAt: number;
}

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/**
 * Maps WMO Weather interpretation codes (WW) to human-readable text and emoji.
 * Reference: https://open-meteo.com/en/docs
 */
export function getWeatherInterpretation(code: number, isDay: boolean = true): { text: string; emoji: string } {
  switch (code) {
    case 0:
      return { text: 'Clear sky', emoji: isDay ? '☀️' : '🌙' };
    case 1:
      return { text: 'Mainly clear', emoji: isDay ? '🌤️' : '🌑' };
    case 2:
      return { text: 'Partly cloudy', emoji: isDay ? '⛅' : '☁️' };
    case 3:
      return { text: 'Overcast', emoji: '☁️' };
    case 45:
      return { text: 'Foggy', emoji: '🌫️' };
    case 48:
      return { text: 'Depositing rime fog', emoji: '🌫️' };
    case 51:
    case 53:
    case 55:
      return { text: 'Drizzle', emoji: '🌦️' };
    case 56:
    case 57:
      return { text: 'Freezing drizzle', emoji: '🌧️' };
    case 61:
    case 63:
    case 65:
      return { text: 'Rain', emoji: '🌧️' };
    case 66:
    case 67:
      return { text: 'Freezing rain', emoji: '🌧️' };
    case 71:
    case 73:
    case 75:
    case 77:
      return { text: 'Snow', emoji: '❄️' };
    case 80:
    case 81:
    case 82:
      return { text: 'Rain showers', emoji: '🌦️' };
    case 85:
    case 86:
      return { text: 'Snow showers', emoji: '🌨️' };
    case 95:
      return { text: 'Thunderstorm', emoji: '⛈️' };
    case 96:
    case 99:
      return { text: 'Thunderstorm with hail', emoji: '⛈️' };
    default:
      return { text: 'Clear', emoji: isDay ? '☀️' : '🌙' };
  }
}

/**
 * Fetches current weather from Open-Meteo API.
 * Free, no API key required.
 */
export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  tempUnit: 'c' | 'f' = 'c',
  cityName?: string
): Promise<WeatherData> {
  const tempParam = tempUnit === 'f' ? '&temperature_unit=fahrenheit' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true${tempParam}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather fetch failed: ${res.statusText}`);
  }

  const data = await res.json();
  const current = data.current_weather;
  const isDay = current.is_day === 1;
  const { text, emoji } = getWeatherInterpretation(current.weathercode, isDay);

  return {
    temperature: Math.round(current.temperature),
    tempUnit,
    weatherCode: current.weathercode,
    weatherText: text,
    weatherEmoji: emoji,
    isDay,
    windSpeed: current.windspeed,
    city: cityName,
    fetchedAt: Date.now(),
  };
}

/**
 * Searches city coordinates via Open-Meteo Geocoding API.
 */
export async function searchCities(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }));
}
