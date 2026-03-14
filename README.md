# LeadHunter

CRM para busqueda de trabajo freelance con clasificacion automatica y generacion de mensajes.

## Categorias

- **A: Freelance Directo** - Empresas buscando contractors/freelancers, aceptan LATAM
- **B: Agencias** - Plataformas tipo Lemon.io, TopTal, etc.
- **C: Outbound** - Oportunidades para proponer servicios (agregar manualmente)
- **D: Full-time Backup** - Puestos full-time por si algun dia te interesa

## Como funciona el scoring

El sistema analiza cada lead y calcula:

- **Tech Score** (0-50): Cuantas tecnologias de tu perfil menciona (.NET, React, etc)
- **Location Score** (-100 a 20): Si dice "US only" = descartado. Si dice "remote/LATAM" = bonus
- **Type Score** (0-25): Freelance/contract = alto. Full-time = bajo
- **Domain Score** (0-15): Si el dominio matchea (logistics, healthcare, etc)

**Descarte automatico** si el lead menciona:
- "US only", "USA based", "onsite only"
- "clearance required", "US citizen"
- "relocation required"

## Instalacion

```bash
npm install
npm run db:init
npm start

# En otra terminal
npm run scrape
```

## Comandos

- `npm start` - Servidor en localhost:3000
- `npm run db:init` - Inicializar/resetear base de datos
- `npm run scrape` - Ejecutar todos los scrapers
- `npm run classify` - Reclasificar leads sin categoria

## Para agregar oportunidades outbound

Podes agregar manualmente empresas/startups que encontres:

```bash
curl -X POST http://localhost:3000/api/outbound \
  -H "Content-Type: application/json" \
  -d '{"title":"Startup X","company":"Startup X","description":"Building a logistics platform...","url":"https://..."}'
```

## Personalizar

Edita `data/profile.json` para cambiar:
- `core_tech`: Tecnologias principales (afectan scoring)
- `secondary_tech`: Tecnologias secundarias
- `domains`: Dominios donde tenes experiencia
- `looking_for.locations_bad`: Palabras que descartan leads
