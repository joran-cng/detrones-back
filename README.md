# Projet Président Online - Backend & Serveur de Jeu test

Ce dépôt contient le backend complet du jeu "Président Online". Il est composé d'une API REST (Nuxt 3 / Prisma) et d'un serveur de jeu temps réel (Colyseus + Express).

Dans le cadre de l'évaluation, ce projet a été entièrement dockerisé et préparé pour la production avec Kubernetes et Helm.

---

## 🏗️ Architecture du Projet

Ce projet est un monorepo utilisant `pnpm` (via turborepo). Il comprend :
- **`back/`** : L'API REST développée avec Nuxt 3 et Prisma (port `3000`).
- **`game-server/`** : Le serveur de jeu temps réel WebSocket développé avec Colyseus (port `2567`).
- **`packages/`** : Les librairies partagées (ex: types, configurations).

L'architecture nécessite également **PostgreSQL** pour la persistance des données et **Redis** pour la gestion de l'état de présence de Colyseus.

---

## 🛠️ 1. Démarrer le projet en mode Développement (Local)

Pour travailler sur le code source de l'API ou du Game Server, voici la marche à suivre.

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (pour faire tourner les bases de données en local)

### Installation et Démarrage

1. **Installer les dépendances :**
   À la racine du projet, installez toutes les dépendances du monorepo :
   ```bash
   pnpm install
   ```

2. **Démarrer les bases de données (PostgreSQL & Redis) :**
   Utilisez Docker Compose pour lancer uniquement les services requis pour le développement :
   ```bash
   docker compose up postgres redis -d
   ```

3. **Configurer les variables d'environnement :**
   Vérifiez que le fichier `back/.env` contient bien l'accès à la base locale (et les clés JWT). Si le fichier n'existe pas, créez-le avec le contenu suivant :
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/president?schema=public"
   JWT_SECRET="super-secret-jwt-key-change-me"
   JWT_REFRESH_SECRET="super-secret-refresh-jwt-key-change-me"
   ```

4. **Initialiser la base de données (Prisma) :**
   Appliquez le schéma Prisma à votre base de données PostgreSQL de développement (le docker compose doit être en cours d'exécution) :
   ```bash
   cd back
   npx prisma db push
   cd ..
   ```

5. **Lancer le serveur de développement :**
   À la racine du projet, lancez tous les services en parallèle :
   ```bash
   pnpm run dev
   ```
   
   Vous pouvez maintenant accéder à vos services de développement :
   - **API (Nuxt)** : [http://localhost:3000](http://localhost:3000)
   - **Game Server (Colyseus)** : `ws://localhost:2567` ou [http://localhost:2567](http://localhost:2567)

---

## 🐳 2. Lancer tout le projet via Docker Compose (Test / Déploiement simple)

Si vous souhaitez simplement tester l'application finale dans ses conteneurs de production sans rien installer localement.

1. Construisez et démarrez tous les conteneurs (Bases de données + API + Game Server) :
   ```bash
   docker compose up --build -d
   ```
   *(Le conteneur `prisma-setup` se chargera automatiquement d'initialiser la base de données et s'arrêtera ensuite).*

2. Vérifiez que les 4 services tournent correctement :
   ```bash
   docker compose ps
   ```

3. Pour arrêter l'environnement :
   ```bash
   docker compose down
   ```

---

## 🚀 3. Déploiement de Production (Kubernetes & Helm)

Le projet est préparé pour des environnements distribués avec Kubernetes.

### Déploiement via manifestes standards (`k8s/`)

1. Assurez-vous d'avoir Kubernetes activé (ex: *Docker Desktop -> Settings -> Kubernetes -> Enable*).
2. Arrêtez les éventuels instances `docker-compose` locales : `docker compose down`.
3. Assurez-vous d'avoir construit les images Docker localement via la commande docker compose de l'étape précédente.
4. Appliquez l'ensemble des manifestes :
   ```bash
   kubectl apply -f ./k8s
   ```
5. Vérifiez l'état des Pods :
   ```bash
   kubectl get pods
   ```
6. **Tester l'accès :** Liez les services Kubernetes à votre machine :
   ```bash
   kubectl port-forward service/back 3000:80
   kubectl port-forward service/game-server 2567:2567
   ```

### Déploiement Unifié via Helm (`chart/president`)

Pour un déploiement encore plus adapté aux standards de l'industrie, une *Helm Chart* a été créée. Helm permet de gérer l'intégralité de l'application avec des variables configurables (`values.yaml`).

1. Si des ressources Kubernetes de l'étape précédente sont actives, supprimez-les : `kubectl delete -f ./k8s`
2. Installez la charte Helm complète :
   ```bash
   helm install president-stack ./chart/president
   ```
3. Pour mettre à jour la configuration (ex: `replicas: 5` dans `values.yaml`) :
   ```bash
   helm upgrade president-stack ./chart/president
   ```
4. Pour désinstaller la stack :
   ```bash
   helm uninstall president-stack
   ```

---

## 🔄 4. Pipeline CI/CD et Déploiement Continu

Le dépôt intègre une chaîne d'intégration et de déploiement continu complète via **GitHub Actions**.

### Schéma de l'Architecture CI/CD

```mermaid
graph TD
    Developer[Développeur] -->|git push branch| GitHub{GitHub Repository}
    GitHub -->|Déclenche la CI/CD| Actions[GitHub Actions Runner]
    
    subgraph CI : Intégration Continue
        Actions -->|1. Setup| Env[Node.js v20 & PNPM Cache]
        Env -->|2. Install| Deps[pnpm install --frozen-lockfile]
        Deps -->|3. Typegen| Nuxt[nuxt prepare]
        Nuxt -->|4. Compile| Build[pnpm build Monorepo]
        Build -->|5. Test| Tests[pnpm test Vitest]
        Tests -->|6. Sécurité| Audit[pnpm audit CVEs]
    end
    
    subgraph CD : Déploiement Continu
        Audit -->|7. Condition: Push sur main| DB[Prisma DB Push]
        DB -->|Migration PostgreSQL| Postgres[(Render PostgreSQL)]
        DB -->|8. Webhooks Render| Webhook[Deploy Webhooks]
        Webhook -->|Pull latest code| RenderAPI[API REST Nuxt 3]
        Webhook -->|Pull latest code| RenderGame[Game Server Colyseus]
    end
```

### Comment Cloner le Projet Backend
```bash
git clone git@github.com:joran-cng/detrones-back.git
cd detrones-back
```

### Comment Exécuter les Tests Unitaires Localement
Les tests unitaires vérifient les routes REST (comme `/api/health`) et la validation de sécurité des jetons de connexion (JWT). Ils s'exécutent avec **Vitest** :
```bash
pnpm test
```

### Fonctionnement du Pipeline (`.github/workflows/deploy.yml`)
*   **Intégration Continue (CI)** : À chaque modification poussée ou dans une Pull Request vers `main`, GitHub Actions installe les dépendances avec cache (pnpm), compile l'application globale, lance les tests unitaires et vérifie la sécurité des dépendances (`pnpm audit`).
*   **Déploiement Continu (CD)** : Lors d'un push direct sur la branche `main` :
    1. Le pipeline met à jour le schéma de la base de données PostgreSQL de production à l'aide de `prisma db push`.
    2. Le pipeline notifie Render via des Webhooks HTTP POST sécurisés pour recompiler et redémarrer à chaud les services d'API REST et le serveur de jeu Colyseus.

### Comment suivre les exécutions et les logs
1. Rendez-vous sur votre dépôt GitHub.
2. Cliquez sur l'onglet **Actions**.
3. Dans la colonne de gauche, sélectionnez **CI/CD Backend - Nuxt & Colyseus**.
4. Cliquez sur le run de votre choix pour voir les logs d'exécution en temps réel de chaque étape.

