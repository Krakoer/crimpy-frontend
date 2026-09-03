dev:
    npm run dev
install:
    npm install
test:
    npx playwright test --workers 2
fmt:
    npm run format
lint:
    npm run lint

preprod-release *args:
    ./scripts/preprod-release.sh {{args}}

prod-release bump *args:
    ./scripts/prod-release.sh {{bump}} {{args}}
