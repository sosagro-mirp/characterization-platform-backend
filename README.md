# SOS Agro Characterization Platform API

1. Clonar el repositorio:

```bash
git clone
```

2. Instalar las dependencias:

```bash
pnpm install
```

3. Crear un archivo `.env` basado en el archivo `.env.template` y completar las variables de entorno con la configuración de tu base de datos:

```bash
cp .env.template .env
```

4. Levantar la base de datos: 

```bash
docker-compose up -d
```

5. Levantar el servidor de desarrollo:

```bash
pnpm run start:dev
```
