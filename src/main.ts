import Vue from 'vue'
import App from './App.vue'
import vueCompositionApi from '@vue/composition-api'
import './registerServiceWorker'
import router from './router'
import store from './store'

Vue.config.productionTip = false
Vue.use(vueCompositionApi)

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')
