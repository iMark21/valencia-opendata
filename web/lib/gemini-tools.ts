import { SchemaType } from "@google/generative-ai";
import type { FunctionDeclaration } from "@google/generative-ai";

const nearSchema = {
  type: SchemaType.OBJECT,
  description: "Coordenadas WGS84 para búsqueda por proximidad.",
  properties: {
    lat: { type: SchemaType.NUMBER, description: "Latitud" },
    lng: { type: SchemaType.NUMBER, description: "Longitud" },
    radius_m: { type: SchemaType.NUMBER, description: "Radio en metros (opcional)" },
  },
  required: ["lat", "lng"],
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = ([
  {
    name: "geocode_address",
    description:
      "Convierte el nombre de una calle, lugar o dirección de València en coordenadas " +
      "geográficas (lat/lng). Úsalo SIEMPRE que necesites coordenadas de un lugar antes " +
      "de llamar a cualquier tool que acepte el parámetro `near`.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            "Nombre del lugar o dirección a geocodificar (ej. 'Avenida Primado Reig', " +
            "'Mercado de Ruzafa', 'Calle Colón 10'). No incluyas 'Valencia' ni 'Spain', " +
            "se añaden automáticamente.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_air_quality",
    description:
      "Lecturas en vivo de calidad del aire en las estaciones RVVCCA de València " +
      "(NO2, PM10, PM2.5, O3, SO2, CO). Devuelve valores con comparativa OMS/UE y " +
      "puntero al histórico desde 2016.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        station: {
          type: SchemaType.STRING,
          description:
            "Nombre de la estación (ej. 'centre', 'russafa', 'molí-del-sol'). Omitir para todas.",
        },
        pollutant: {
          type: SchemaType.STRING,
          enum: ["no2", "pm10", "pm25", "o3", "so2", "co", "all"],
          description: "Contaminante a filtrar. Por defecto 'all'.",
        },
        near: nearSchema,
        include_history_pointer: {
          type: SchemaType.BOOLEAN,
          description: "Incluir puntero al CSV histórico (47MB). Por defecto true.",
        },
      },
    },
  },
  {
    name: "get_valenbisi_availability",
    description:
      "Disponibilidad en tiempo real de estaciones ValenBisi (bicicletas compartidas). " +
      "Devuelve bicicletas disponibles, muelles libres y estado por estación.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        near: nearSchema,
        station_id: {
          type: SchemaType.NUMBER,
          description: "Número de estación específica (1..N).",
        },
        only_available: {
          type: SchemaType.BOOLEAN,
          description: "Solo estaciones con bicis disponibles. Por defecto true.",
        },
        limit: {
          type: SchemaType.NUMBER,
          description: "Máximo de estaciones a devolver (default 10, max 30).",
        },
      },
    },
  },
  {
    name: "get_traffic_state",
    description:
      "Estado del tráfico en tiempo real: tramos (fluido/denso/congestionado/cortado), " +
      "intensidad (vehículos/hora) y URLs de cámaras de vigilancia.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        scope: {
          type: SchemaType.STRING,
          enum: ["tramos", "intensity", "cameras", "all"],
          description: "Tipo de dato de tráfico a consultar.",
        },
        near: nearSchema,
        limit: { type: SchemaType.NUMBER, description: "Máximo de resultados (default 20)." },
      },
      required: ["scope"],
    },
  },
  {
    name: "get_neighborhood_info",
    description:
      "Información sobre barrios de València: nombre, distrito, área, centroide, " +
      "y punteros a datasets de vulnerabilidad, renta e índices socioeconómicos.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        barri: {
          type: SchemaType.STRING,
          description: "Nombre del barrio (ej. 'russafa', 'benimaclet', 'campanar'). Sin tildes.",
        },
        at: {
          type: SchemaType.OBJECT,
          description: "Coordenadas para buscar el barrio en ese punto (point-in-polygon).",
          properties: {
            lat: { type: SchemaType.NUMBER },
            lng: { type: SchemaType.NUMBER },
          },
          required: ["lat", "lng"],
        },
        list_all: {
          type: SchemaType.BOOLEAN,
          description: "Listar todos los barrios.",
        },
      },
    },
  },
  {
    name: "get_neighborhood_pulse",
    description:
      "Puntuación compuesta de calidad ambiental de un barrio (0-100): " +
      "combina calidad del aire, ruido, zonas verdes y vulnerabilidad socioeconómica. " +
      "Permite comparar dos barrios.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        barri: {
          type: SchemaType.STRING,
          description: "Nombre del barrio a evaluar.",
        },
        compare_with: {
          type: SchemaType.STRING,
          description: "Segundo barrio para comparar (opcional).",
        },
        weights: {
          type: SchemaType.OBJECT,
          description: "Pesos personalizados para cada componente (0-1).",
          properties: {
            air: { type: SchemaType.NUMBER },
            noise: { type: SchemaType.NUMBER },
            green: { type: SchemaType.NUMBER },
            vulnerability: { type: SchemaType.NUMBER },
          },
        },
      },
      required: ["barri"],
    },
  },
  {
    name: "get_emt_stops",
    description:
      "Paradas de autobús EMT de València cercanas o de una línea concreta. " +
      "Devuelve nombre, líneas, coordenadas y URL de llegadas en tiempo real.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        near: nearSchema,
        linea: {
          type: SchemaType.STRING,
          description: "Código de línea EMT (ej. '10', '35', 'N1').",
        },
        include_inactive: {
          type: SchemaType.BOOLEAN,
          description: "Incluir paradas inactivas. Por defecto false.",
        },
        limit: { type: SchemaType.NUMBER, description: "Máximo de paradas (default 10, max 50)." },
      },
    },
  },
  {
    name: "full_text_search",
    description:
      "Búsqueda de texto completo en los 294 datasets del portal de datos abiertos " +
      "de València (CKAN). Devuelve datasets relevantes con score de relevancia Solr.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: "Términos de búsqueda (compatible Solr).",
        },
        rows: { type: SchemaType.NUMBER, description: "Resultados a devolver (default 10, max 30)." },
        start: { type: SchemaType.NUMBER, description: "Offset para paginación." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_datasets",
    description:
      "Lista datasets del portal de datos abiertos de València con filtros por tema, " +
      "formato o texto. Útil para descubrir qué datos existen.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "Texto libre para filtrar datasets." },
        theme: { type: SchemaType.STRING, description: "Tema/categoría del dataset." },
        format: {
          type: SchemaType.STRING,
          enum: ["csv", "json", "geojson", "shp", "kmz", "xlsx", "wfs", "wms"],
          description: "Formato de los recursos.",
        },
        limit: { type: SchemaType.NUMBER, description: "Resultados por página (default 20, max 50)." },
        offset: { type: SchemaType.NUMBER, description: "Offset para paginación." },
      },
    },
  },
  {
    name: "get_dataset",
    description:
      "Metadatos completos de un dataset del portal CKAN de València: " +
      "descripción, organización, licencia, recursos disponibles y layers ArcGIS relacionados.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: {
          type: SchemaType.STRING,
          description: "ID o slug del dataset (ej. 'rvvcca-dades-horaries-de-qualitat-de-l-aire').",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_dataset_resource",
    description:
      "Detalles de un recurso concreto de un dataset: URL de descarga, formato, " +
      "tamaño en bytes y esquema inferido (primeras columnas del CSV/JSON).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        resource_id: {
          type: SchemaType.STRING,
          description: "UUID del recurso CKAN.",
        },
        infer_schema: {
          type: SchemaType.BOOLEAN,
          description: "Intentar inferir esquema de columnas. Por defecto false.",
        },
      },
      required: ["resource_id"],
    },
  },
  {
    name: "find_geo_layers",
    description:
      "Descubre servicios y capas del Geoportal ArcGIS de València. " +
      "Sin argumentos lista todos los servicios; con `service` lista las capas de ese servicio; " +
      "con `query` busca capas por nombre.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        service: {
          type: SchemaType.STRING,
          description:
            "Nombre del servicio ArcGIS (ej. 'OPENDATA/Trafico', 'OPENDATA/MedioAmbiente').",
        },
        query: {
          type: SchemaType.STRING,
          description: "Texto para buscar capas por nombre (insensible a acentos).",
        },
      },
    },
  },
  {
    name: "query_geo_layer",
    description:
      "Consulta directa a una capa ArcGIS del Geoportal de València. " +
      "Permite filtros SQL, búsqueda por proximidad, bounding box y selección de campos.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        service: {
          type: SchemaType.STRING,
          description: "Nombre del servicio ArcGIS (ej. 'OPENDATA/Trafico').",
        },
        layer_id: {
          type: SchemaType.NUMBER,
          description: "ID de la capa dentro del servicio.",
        },
        where: {
          type: SchemaType.STRING,
          description: "Filtro SQL (ej. '1=1', 'status=\\'open\\'').",
        },
        out_fields: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Campos a devolver.",
        },
        near: nearSchema,
        limit: {
          type: SchemaType.NUMBER,
          description: "Máximo de features (default 50, max 500).",
        },
      },
      required: ["service", "layer_id"],
    },
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any) as FunctionDeclaration[];

export const TOOL_NAMES = TOOL_DECLARATIONS.map((t) => t.name);
