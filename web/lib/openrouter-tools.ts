import type OpenAI from "openai";

type Tool = OpenAI.Chat.Completions.ChatCompletionFunctionTool;

const nearSchema = {
  type: "object",
  description: "Coordenadas WGS84 para búsqueda por proximidad.",
  properties: {
    lat: { type: "number", description: "Latitud" },
    lng: { type: "number", description: "Longitud" },
    radius_m: { type: "number", description: "Radio en metros (opcional)" },
  },
  required: ["lat", "lng"],
};

export const OR_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "geocode_address",
      description:
        "Convierte el nombre de una calle, lugar o dirección de València en coordenadas " +
        "geográficas (lat/lng). Úsalo SIEMPRE que necesites coordenadas de un lugar antes " +
        "de llamar a cualquier tool que acepte el parámetro `near`.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Nombre del lugar o dirección (ej. 'Avenida Primado Reig', 'Mercado de Ruzafa'). " +
              "No incluyas 'Valencia' ni 'Spain'.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_air_quality",
      description:
        "Lecturas en vivo de calidad del aire en las estaciones RVVCCA de València " +
        "(NO2, PM10, PM2.5, O3, SO2, CO). Devuelve valores con comparativa OMS/UE.",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string", description: "Nombre de la estación. Omitir para todas." },
          pollutant: {
            type: "string",
            enum: ["no2", "pm10", "pm25", "o3", "so2", "co", "all"],
            description: "Contaminante a filtrar. Por defecto 'all'.",
          },
          near: nearSchema,
          include_history_pointer: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_valenbisi_availability",
      description:
        "Disponibilidad en tiempo real de estaciones ValenBisi (bicicletas compartidas). " +
        "Devuelve bicicletas disponibles, muelles libres y estado.",
      parameters: {
        type: "object",
        properties: {
          near: nearSchema,
          station_id: { type: "number", description: "Número de estación específica." },
          only_available: { type: "boolean", description: "Solo estaciones con bicis." },
          limit: { type: "number", description: "Máximo de estaciones (default 10, max 30)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_traffic_state",
      description:
        "Estado del tráfico en tiempo real: tramos (fluido/denso/congestionado/cortado), " +
        "intensidad y cámaras de vigilancia.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["tramos", "intensity", "cameras", "all"],
            description: "Tipo de dato de tráfico.",
          },
          near: nearSchema,
          limit: { type: "number", description: "Máximo de resultados (default 20)." },
        },
        required: ["scope"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_neighborhood_info",
      description:
        "Información sobre barrios de València: nombre, distrito, área, centroide y " +
        "punteros a datasets de vulnerabilidad y renta.",
      parameters: {
        type: "object",
        properties: {
          barri: { type: "string", description: "Nombre del barrio (sin tildes)." },
          at: {
            type: "object",
            description: "Coordenadas para point-in-polygon.",
            properties: {
              lat: { type: "number" },
              lng: { type: "number" },
            },
            required: ["lat", "lng"],
          },
          list_all: { type: "boolean", description: "Listar todos los barrios." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_neighborhood_pulse",
      description:
        "Puntuación compuesta de calidad ambiental de un barrio (0-100): " +
        "aire, ruido, zonas verdes y vulnerabilidad. Permite comparar dos barrios.",
      parameters: {
        type: "object",
        properties: {
          barri: { type: "string", description: "Nombre del barrio." },
          compare_with: { type: "string", description: "Segundo barrio para comparar." },
          weights: {
            type: "object",
            properties: {
              air: { type: "number" },
              noise: { type: "number" },
              green: { type: "number" },
              vulnerability: { type: "number" },
            },
          },
        },
        required: ["barri"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_emt_stops",
      description:
        "Paradas de autobús EMT de València cercanas o de una línea concreta. " +
        "Devuelve nombre, líneas y coordenadas.",
      parameters: {
        type: "object",
        properties: {
          near: nearSchema,
          linea: { type: "string", description: "Código de línea EMT (ej. '10', 'N1')." },
          include_inactive: { type: "boolean" },
          limit: { type: "number", description: "Máximo de paradas (default 10, max 50)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "full_text_search",
      description:
        "Búsqueda en los 294 datasets del portal de datos abiertos de València (CKAN).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Términos de búsqueda." },
          rows: { type: "number", description: "Resultados (default 10, max 30)." },
          start: { type: "number", description: "Offset para paginación." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_datasets",
      description: "Lista datasets del portal de datos abiertos de València con filtros.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          theme: { type: "string" },
          format: {
            type: "string",
            enum: ["csv", "json", "geojson", "shp", "kmz", "xlsx", "wfs", "wms"],
          },
          limit: { type: "number" },
          offset: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dataset",
      description: "Metadatos completos de un dataset CKAN de València.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "ID o slug del dataset." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dataset_resource",
      description: "Detalles de un recurso concreto de un dataset: URL, formato, esquema.",
      parameters: {
        type: "object",
        properties: {
          resource_id: { type: "string", description: "UUID del recurso CKAN." },
          infer_schema: { type: "boolean" },
        },
        required: ["resource_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_geo_layers",
      description:
        "Descubre servicios y capas del Geoportal ArcGIS de València.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string" },
          query: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_geo_layer",
      description: "Consulta directa a una capa ArcGIS del Geoportal de València.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string" },
          layer_id: { type: "number" },
          where: { type: "string" },
          out_fields: { type: "array", items: { type: "string" } },
          near: nearSchema,
          limit: { type: "number" },
        },
        required: ["service", "layer_id"],
      },
    },
  },
];

export const TOOL_NAMES = OR_TOOLS.map((t) => t.function.name);
