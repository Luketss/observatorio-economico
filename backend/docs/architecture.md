# 🏗️ Arquitetura

## 📐 Padrão Arquitetural

O backend segue princípios de **Clean Architecture**, com separação clara de responsabilidades.

### Camadas:

- **Controllers (API)** → Interface HTTP
- **Services** → Regras de negócio
- **Repositories** → Acesso a dados
- **Core** → Segurança, Config, Logging, Exceções

---

## 🔁 Fluxo de Requisição

```
Request
  ↓
Router (Controller)
  ↓
Service
  ↓
Repository
  ↓
Banco de Dados
```

Resposta segue padrão:

- `SuccessResponse`
- `PaginatedResponse`

---

## ✅ Benefícios

- Código organizado
- Fácil manutenção
- Alta escalabilidade
- Testabilidade
