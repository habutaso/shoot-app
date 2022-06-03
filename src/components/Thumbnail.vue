<template>
  <div>
    <div>a</div>
    <div>{{shoable}}</div>
    <div v-for="(b, name) in shoable" :key=name>
      <div>name</div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from '@vue/composition-api'
export default defineComponent ({
  name: 'ThumbnailComp',
  props: {
    blobs: Array
  },
  setup (props, _) {
    const shoable = computed(() => {
      if (!props.blobs) return []
      return props.blobs.map(b => {
        return URL.createObjectURL(b)
      })
    })
    return {
      shoable
    }
  }
})
</script>

<style>

</style>