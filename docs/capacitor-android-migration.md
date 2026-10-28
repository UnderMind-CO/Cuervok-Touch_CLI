# Migración de Electron a Android con Capacitor

## Resumen

Este documento explica cómo portar el cliente Electron Cuervok a Android nativo usando Capacitor, reescribiendo el backend Node.js en Java/Kotlin.

## ¿Qué es Capacitor?

Capacitor es un runtime cross-platform que permite ejecutar aplicaciones web en dispositivos móviles. Funciona de la siguiente manera:

1. **Frontend**: Tu código web (HTML/CSS/JS/React) se ejecuta en un WebView nativo
2. **Bridge**: Capacitor provee un puente entre JavaScript y código nativo (Java/Kotlin en Android)
3. **Plugins**: Funcionalidades nativas se exponen como plugins que puedes llamar desde JavaScript

## Arquitectura de la Migración

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON (ACTUAL)                         │
├─────────────────────────────────────────────────────────────┤
│  Frontend React   │  Backend Node.js                         │
│  - Vite/React     │  - better-sqlite3                        │
│  - React Router   │  - discord-rpc                           │
│  - Zustand        │  - electron-store                        │
│  - Tailwind       │  - electron-updater                      │
│                   │  - Hono server                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              CAPACITOR ANDROID (OBJETIVO)                    │
├─────────────────────────────────────────────────────────────┤
│  Frontend React   │  Backend Java/Kotlin (Native Plugins)   │
│  - Vite/React     │  - Room/SQLite (para better-sqlite3)     │
│  - React Router   │  - Discord SDK (para discord-rpc)        │
│  - Zustand        │  - SharedPreferences (para store)        │
│  - Tailwind       │  - Android Update Manager (updater)     │
│                   │  - API HTTP nativa (para Hono)           │
└─────────────────────────────────────────────────────────────┘
```

## Paso 1: Instalación de Capacitor

### 1.1 Instalar dependencias

```bash
pnpm install @capacitor/core @capacitor/cli @capacitor/android
```

### 1.2 Inicializar Capacitor

```bash
npx cap init
```

Esto te pedirá:
- **App name**: Cuervok
- **App ID**: com.cuervok.app
- **Web directory**: dist (donde Vite genera el build)

### 1.3 Configurar capacitor.config.ts

Crear `capacitor.config.ts`:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cuervok.app',
  appName: 'Cuervok',
  webDir: 'dist',
  server: {
    androidScheme: 'https'  // Necesario para Capacitor 6+
  },
  plugins: {
    // Plugins se registrarán aquí
  }
};

export default config;
```

### 1.4 Agregar plataforma Android

```bash
npx cap add android
```

Esto crea una carpeta `android/` con el proyecto nativo de Android.

## Paso 2: Preparar el Frontend

### 2.1 Modificar el build de Vite

El frontend React debe empaquetarse como assets estáticos. Tu `vite.config.ts` probablemente ya lo hace, pero asegúrate de:

```typescript
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Asegúrate de que sea standalone
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})
```

### 2.2 Eliminar dependencias de Electron del frontend

El código que corre en el renderer process (frontend) NO debe usar:
- `require('electron')`
- Módulos de Node.js (`fs`, `path`, etc.)
- Código específico de Electron (`ipcRenderer`, etc.)

Si tu frontend usa, necesitas:
1. Reemplazarlos con APIs web equivalentes, o
2. Crear un plugin Capacitor que exponga la funcionalidad nativa

### 2.3 Sincronizar assets con Android

```bash
pnpm run build          # Genera dist/
npx cap sync android    # Copia dist/ a android/app/src/main/assets/public
```

## Paso 3: Crear Plugins Nativos (Backend en Java)

### 3.1 Estructura de un Plugin Capacitor

Un plugin Capacitor para Android tiene esta estructura:

```
android/
└── app/
    └── src/
        └── main/
            ├── java/
            │   └── com/
            │       └── cuervok/
            │           └── app/
            │               └── plugins/
            │                   └── MiPlugin/
            │                       ├── MiPlugin.java      # Bridge principal
            │                       └── MiPluginImpl.java  # Implementación
            └── AndroidManifest.xml
```

### 3.2 Ejemplo: Plugin para Base de Datos (reemplazo de better-sqlite3)

#### Opción A: Usar plugin existente @capacitor-community/sqlite

```bash
pnpm install @capacitor-community/sqlite
```

Configurar en `capacitor.config.ts`:

```typescript
plugins: {
  CapacitorSQLite: {
    iosDatabaseLocation: 'Library/CapacitorDatabase',
    androidIsEncryption: false,
    electronIsEncryption: false
  }
}
```

Uso en JavaScript:

```typescript
import { CapacitorSQLite } from '@capacitor-community/sqlite';

// Abre una conexión
const ret = await CapacitorSQLite.createConnection({
  database: 'dofus.db',
  encrypted: false,
  mode: 'no-encryption'
});

// Ejecuta query
const result = await CapacitorSQLite.execute({
  statement: 'SELECT * FROM characters WHERE id = ?',
  values: [123]
});
```

#### Opción B: Crear plugin personalizado con Room (Java)

Crear `android/app/src/main/java/com/cuervok/app/plugins/database/DatabasePlugin.java`:

```java
package com.cuervok.app.plugins.database;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DatabasePlugin")
public class DatabasePlugin extends Plugin {

    @PluginMethod()
    public void query(PluginCall call) {
        String sql = call.getString("sql");
        JSArray params = call.getArray("params");

        try {
            // Usar Room para ejecutar query
            DatabaseManager db = DatabaseManager.getInstance(getContext());
            JSObject result = db.rawQuery(sql, params);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Query failed: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void execute(PluginCall call) {
        String sql = call.getString("sql");
        JSArray params = call.getArray("params");

        try {
            DatabaseManager db = DatabaseManager.getInstance(getContext());
            db.execute(sql, params);
            call.resolve();
        } catch (Exception e) {
            call.reject("Execute failed: " + e.getMessage());
        }
    }
}
```

Implementación con Room:

```java
@Entity(tableName = "characters")
public class Character {
    @PrimaryKey
    public int id;
    public String name;
    public int level;
    // ... otros campos
}

@Dao
public interface CharacterDao {
    @Query("SELECT * FROM characters WHERE id = :id")
    Character getById(int id);

    @Insert
    void insert(Character character);

    @Update
    void update(Character character);
}

@Database(entities = {Character.class}, version = 1)
public abstract class AppDatabase extends RoomDatabase {
    public abstract CharacterDao characterDao();
}

public class DatabaseManager {
    private static AppDatabase instance;

    public static AppDatabase getInstance(Context context) {
        if (instance == null) {
            instance = Room.databaseBuilder(
                context.getApplicationContext(),
                AppDatabase.class,
                "dofus.db"
            ).build();
        }
        return instance;
    }
}
```

### 3.3 Ejemplo: Plugin para Storage (reemplazo de electron-store)

Crear `android/app/src/main/java/com/cuervok/app/plugins/storage/StoragePlugin.java`:

```java
package com.cuervok.app.plugins.storage;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StoragePlugin")
public class StoragePlugin extends Plugin {

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences("cuervok_prefs", Context.MODE_PRIVATE);
    }

    @PluginMethod()
    public void get(PluginCall call) {
        String key = call.getString("key");
        SharedPreferences prefs = getPrefs();
        String value = prefs.getString(key, null);

        JSObject result = new JSObject();
        result.put("value", value);
        call.resolve(result);
    }

    @PluginMethod()
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");

        SharedPreferences prefs = getPrefs();
        prefs.edit().putString(key, value).apply();

        call.resolve();
    }

    @PluginMethod()
    public void remove(PluginCall call) {
        String key = call.getString("key");
        SharedPreferences prefs = getPrefs();
        prefs.edit().remove(key).apply();

        call.resolve();
    }
}
```

Uso en JavaScript:

```typescript
import { registerPlugin } from '@capacitor/core';

const StoragePlugin = registerPlugin<StoragePlugin>('StoragePlugin');

interface StoragePlugin {
  get: (options: { key: string }) => Promise<{ value: string | null }>;
  set: (options: { key: string; value: string }) => Promise<void>;
  remove: (options: { key: string }) => Promise<void>;
}

// Usar
await StoragePlugin.set({ key: 'user.name', value: 'Cuervok' });
const result = await StoragePlugin.get({ key: 'user.name' });
```

### 3.4 Ejemplo: Plugin para Discord (reemplazo de discord-rpc)

Discord RPC es específico de desktop. En Android, la alternativa es usar Discord SDK móvil:

Crear `android/app/src/main/java/com/cuervok/app/plugins/discord/DiscordPlugin.java`:

```java
package com.cuervok.app.plugins.discord;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DiscordPlugin")
public class DiscordPlugin extends Plugin {

    @PluginMethod()
    public void setActivity(PluginCall call) {
        String state = call.getString("state");
        String details = call.getString("details");

        // Integrar con Discord SDK para Android
        // O usar deep links para abrir Discord
        try {
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to set activity: " + e.getMessage());
        }
    }
}
```

### 3.5 Ejemplo: Plugin para Actualizaciones (reemplazo de electron-updater)

Android tiene su propio sistema de actualizaciones. Usar Google Play In-App Updates:

```java
package com.cuervok.app.plugins/updater;

import android.app.Activity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "UpdaterPlugin")
public class UpdaterPlugin extends Plugin {

    @PluginMethod()
    public void checkForUpdate(PluginCall call) {
        Activity activity = getActivity();
        AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(activity);

        appUpdateManager.getAppUpdateInfo().addOnSuccessListener(appUpdateInfo -> {
            if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
                JSObject result = new JSObject();
                result.put("available", true);
                result.put("version", appUpdateInfo.availableVersionCode());
                call.resolve(result);
            } else {
                JSObject result = new JSObject();
                result.put("available", false);
                call.resolve(result);
            }
        }).addOnFailureListener(e -> {
            call.reject("Failed to check for updates: " + e.getMessage());
        });
    }

    @PluginMethod()
    public void startUpdate(PluginCall call) {
        Activity activity = getActivity();
        AppUpdateManager appUpdateManager = AppUpdateManagerFactory.create(activity);

        // Lógica para iniciar actualización
        // ... código de Google Play In-App Updates
    }
}
```

## Paso 4: Mapeo de Dependencias

| Dependencia Electron | Reemplazo Capacitor/Android |
|---------------------|----------------------------|
| `better-sqlite3` | @capacitor-community/sqlite o Room plugin personalizado |
| `discord-rpc` | Discord SDK Android o eliminar (móvil no tiene RPC) |
| `electron-store` | SharedPreferences (plugin personalizado) |
| `electron-updater` | Google Play In-App Updates |
| `@hono/node-server` | Eliminar server HTTP, usar APIs directamente o backend externo |
| `@sentry/electron` | @sentry/capacitor |
| `get-port` | No necesario en Android |

## Paso 5: Build y Ejecución

### 5.1 Sincronizar assets

```bash
pnpm run build
npx cap sync android
```

### 5.2 Abrir en Android Studio

```bash
npx cap open android
```

### 5.3 Ejecutar en emulador o dispositivo

```bash
npx cap run android
```

O desde Android Studio, clic en el botón "Run".

## Paso 6: Consideraciones Específicas

### 6.1 Sistema de Archivos

Electron usa `fs` para acceso al filesystem. En Android:

- Usa `@capacitor/filesystem` plugin para acceso a archivos
- Solo tienes acceso a ciertos directorios (app-private, documents, etc.)
- No puedes acceder a rutas absolutas arbitrarias

### 6.2 Networking

Si tu app usa un servidor HTTP local (Hono):

- En Android, los servicios locales no funcionan igual
- Opciones:
  1. Mover la lógica del server a plugins nativos
  2. Usar un backend remoto
  3. Exponer APIs nativas que el frontend llama directamente

### 6.3 Permisos Android

Agrega permisos en `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest>
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <!-- Otros permisos según necesites -->
</manifest>
```

### 6.4 Iconos y Splash Screens

Capacitor puede generar recursos automáticamente:

```bash
pnpm install @capacitor/assets
npx cap assets
```

Coloca tu icono en `resources/icon.png` y splash en `resources/splash.png`.

## Recursos

- [Documentación oficial de Capacitor](https://capacitorjs.com/docs)
- [Tutorial de plugins Android](https://capacitorjs.com/docs/plugins/tutorial/android-implementation)
- [Capacitor SQLite plugin](https://github.com/capacitor-community/sqlite)
- [Google Play In-App Updates](https://developer.android.com/guide/play-in-app-updates)

## Conclusión

La migración a Capacitor requiere:

1. ✅ Portar el frontend React (casi directo)
2. ⚠️ Reescribir el backend Node.js como plugins Java/Kotlin
3. ⚠️ Adaptar el sistema de archivos y permisos
4. ⚠️ Configurar actualizaciones a través de Google Play

El tiempo estimado depende de la complejidad del backend. Para un proyecto con 4 dependencias principales como el tuyo, estima 2-4 semanas de desarrollo.
