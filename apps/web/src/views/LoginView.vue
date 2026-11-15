<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ErroDeApi } from '@/api/http'
import { destinoSeguro } from '@/router/destino'
import { useSessao } from '@/stores/sessao'

const sessao = useSessao()
const router = useRouter()
const route = useRoute()

const senha = ref('')
const erro = ref('')
const enviando = ref(false)

async function entrar() {
  if (!senha.value || enviando.value) return
  enviando.value = true
  erro.value = ''
  try {
    await sessao.entrar(senha.value)
    await router.replace(destinoSeguro(route.query.destino))
  } catch (e) {
    senha.value = ''
    if (e instanceof ErroDeApi && e.status === 429) {
      const minutos = Math.ceil((e.esperaSegundos ?? 900) / 60)
      erro.value = `Muitas tentativas. Tente de novo em ${minutos} min.`
    } else if (e instanceof ErroDeApi && e.status === 401) {
      erro.value = 'Senha incorreta.'
    } else {
      erro.value = 'Não foi possível falar com o servidor.'
    }
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <main class="login">
    <form class="card" @submit.prevent="entrar">
      <h1><i aria-hidden="true"></i>Vermögen</h1>
      <!-- Campo de usuário fixo e oculto: ajuda o gerenciador de senhas a guardar a credencial. -->
      <input type="text" name="username" value="matheus" autocomplete="username" hidden readonly />
      <label for="senha">Senha</label>
      <input
        id="senha"
        v-model="senha"
        type="password"
        name="password"
        autocomplete="current-password"
        autofocus
        required
        :disabled="enviando"
      />
      <p class="erro" role="alert">{{ erro }}</p>
      <button type="submit" :disabled="enviando || !senha">Entrar</button>
    </form>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 16px;
}
form {
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  padding: 28px 24px 24px;
}
h1 {
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
}
h1 i {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent), #00b8d9);
}
label {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.02em;
  margin-bottom: 8px;
}
input {
  background: var(--recess);
  border: 1px solid var(--faint);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 16px; /* 16px evita o zoom automático do iOS ao focar. */
}
.erro {
  min-height: 20px;
  margin: 10px 0 14px;
  font-size: 13px;
  color: var(--out);
}
button {
  border: 0;
  border-radius: 10px;
  padding: 12px;
  font-weight: 600;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
