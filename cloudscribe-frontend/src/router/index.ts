import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import PricingView from '../views/PricingView.vue'
import SuccessView from '../views/SuccessView.vue'
import LoginView from '../views/LoginView.vue'
import HistoryView from '../views/HistoryView.vue'
import { supabase } from '../supabase'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/pricing', name: 'pricing', component: PricingView },
    { path: '/success', name: 'success', component: SuccessView },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/history', name: 'history', component: HistoryView },
  ]
})
router.beforeEach(async (to) => {
  const { data } = await supabase.auth.getSession()
  const isAuthenticated = !!data.session

  if (to.name !== 'login' && !isAuthenticated) return { name: 'login' }
  if (to.name === 'login' && isAuthenticated) return { name: 'home' }
})

export default router