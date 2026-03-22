# MSG Mobile (React Native)

Mobile app for the MSG messaging platform.

## Setup

```bash
# From monorepo root
npx create-expo-app@latest apps/mobile --template blank-typescript

# Or use React Native CLI
npx @react-native-community/cli init mobile --directory apps/mobile
```

## Key Dependencies

- `expo` or `react-native` - Core framework
- `@react-navigation/native` - Navigation
- `socket.io-client` - WebSocket
- `zustand` - State management
- `axios` - API client

## Environment

Create `.env` with:
```
EXPO_PUBLIC_API_URL=http://localhost:3000/api
EXPO_PUBLIC_SOCKET_URL=http://localhost:3000
```

## Run

```bash
cd apps/mobile && npx expo start
# Or: npm run android / npm run ios
```
