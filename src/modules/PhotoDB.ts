/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-plus-operands */

import { IDBPDatabase, openDB } from 'idb'
import Compressor from 'compressorjs'

const moji2mb = () => {
  let ret = ''
  let num = 0
  do {
    ret += 'Z'
    num++
  } while (num < 1_000_000)
  return ret
}

/**
 * S3同期時、S3に施す操作
 * 'insert': S3に保存する
 * 'delete': S3から削除する
 * 'stay': 何もしない
 */
export type Operation = 'insert' | 'delete' | 'stay'

/**
 * indexedDBに保存する画像管理オブジェクトのベース
 * 画像データと、どのような操作をされたかを持っている
 */
export interface PhotoState {
  /**
   * S3に保存されているかどうか
   */
  isOnS3: boolean
  /**
   * S3同期時に行う操作
   * @see {@link Operation}
   */
  s3Operation: Operation // S3同期時に行う操作
  /**
   * ファイル名
   */
  fileName: string
  /**
   * mime
   */
  mime: string
  /**
   * ユーザーによって保存ボタンが押されたかどうか
   * @defaultValue false
   */
  isStoredByUser: boolean
  /**
   * 写真の有効期限(エポック秒)
   * TODO: ファイル名にエポック使ってるから要らないかも 2021/11/25 habu
   */
  expirationDate: number // 写真の有効期限(エポック秒)
  /**
   * 写真データ
   * NOTE: indexedDBの外側では、画像をblobとして扱う
   * BUG: iPadでは、indexedDBでBlobを扱うことができない。その代わりArrayBufferで保存する方法がある。
   * @see {@link https://stackoverflow.com/questions/40393488/mobile-safari-10-indexeddb-blobs}
   */
  blob: Blob
}

/**
 * indexedDBに保存する画像管理オブジェクト
* NOTE: indexedDBの外側では、画像をblobとして扱う
* BUG: iPadでは、indexedDBでBlobを扱うことができない。その代わりArrayBufferで保存する方法がある。
* @see {@link https://stackoverflow.com/questions/40393488/mobile-safari-10-indexeddb-blobs}
 */
type PhotoStateInIDB = Omit<PhotoState, 'blob'> & { blob: ArrayBuffer }

export const THUMBNAIL_WIDTH = 70
export const THUMBNAIL_HEIGHT = 70

/**
 * indexedDBの管理とS3への連携を行うクラス
 * ここでは必要最低限の機能を提供する
 */
export class PhotoDB {
  /**
   * indexedDBデータベース名
   */
  private static readonly _DB_NAME: string = 'DisasterInvDB'
  private static readonly _DB_STORE_NAME: string = 'photoDB'
  /**
   * 有効期限差分。エポックミリ秒で1日分にしている。
   */
  private static readonly EXPIRATION_DELTA: number = 86400000
  /**
   * サムネイル用に保存する画像の暗黙的ファイル名プレフィックス
   */
  private static readonly THUMBNAIL_PREFIX: string = 'thumbnail'
  /**
   * サムネイル用画像のクオリティ
   */
  private static readonly THUMBNAIL_QUALITY: number = 0.2
  /**
   * lazyなqueryで一度に返却する要素数
   */
  private static readonly ONCE_QUERY_LIMIT: number = 40
  /**
   * シングルトンインスタンス
   */
  private static _instance: PhotoDB
  /**
   * indexedDBクラス
   * TODO: add type 2021/11/25 habu
   */
  private static _db: IDBPDatabase

  private static async openIDB(): Promise<void> {
    const db = await openDB(PhotoDB._DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(PhotoDB._DB_STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('fileName', 'fileName', { unique: true })
        store.createIndex('expirationDate', 'expirationDate', { unique: false })
      }
    })
    PhotoDB._db = db
  }

  /**
   * シングルトンインスタンスを取得する
   * @readonly
   * @param なし
   * @returns PhotoDB - インスタンス
   */
  public static instance(): PhotoDB {
    if (!PhotoDB._instance) {
      PhotoDB._instance = new PhotoDB()
      PhotoDB.openIDB()
      return PhotoDB._instance
    }
    return PhotoDB._instance
  }

  /**
   * 画像サイズを軽量化する
   * @param value PhotoState
   * @param quality 画質 0 - 1 の少数
   * @param maxWidth 最大横幅px
   * @param maxHeight 最大縦幅px
   * @returns 
   */
  private async compressSub(file: Blob, quality = 0.9, maxWidth = 1500, maxHeight = 1500): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      new Compressor(file, { quality, maxWidth, maxHeight, success: resolve, error: reject })
    })
  }

  /**
   * 画像サイズを軽量化する
   * @param value PhotoState
   * @param quality 画質 0 - 1 の少数
   * @param maxWidth 最大横幅px
   * @param maxHeight 最大縦幅px
   * @returns 
   */
  private async compress(value: PhotoState, quality = 0.9, maxWidth = 1500, maxHeight = 1500): Promise<PhotoState> {
    if (!value.blob.type) {
      value.blob = new Blob([value.blob], { type: value.mime })
    }
    const compressed: Blob = await this.compressSub(value.blob, quality, maxWidth, maxHeight)
    return { ...value, blob: compressed }
  }

  /**
   * PhotoStateInIDBからPhotoStateに変換する
   * mobile iOSのindexedDBから取ってきた画像arraybufferをblobに変換して出力
   * @param state PhotoStateInIDB
   * @returns PhotoState
   */
  private convertInToOut(state: PhotoStateInIDB): PhotoState {
    return { ...state, blob: new Blob([state.blob], { type: state.mime }) }
  }

  /**
   * PhotoStateからPhotoStateInIDBに変換する
   * mobile iOSのindexedDBに画像を保存するため、blobからarraybufferに変換する
   * @param state PhotoState
   * @returns PhotoStateInIDB
   */
  private async convertOutToIn(state: PhotoState): Promise<PhotoStateInIDB> {
    let arraybuffer: ArrayBuffer = new ArrayBuffer(0)
    await state.blob.arrayBuffer().then(ab => { arraybuffer = ab })
    return { ...state, blob: arraybuffer }
  }

  /**
   * indexedDBにPhotoStateを挿入する
   * keyPathに fileName を指定しているので、value.fileNameがないと動かない
   * @param value 挿入したいPhotoState
   * @returns PhotoDBインスタンス
   */
  public async insertItem(value: PhotoState): Promise<void> {
    if (!PhotoDB._db) await PhotoDB.openIDB()
    // BUG: iPadでは、indexedDBに画像を保存する時はarrayBufferにしないといけないようである。
    if (!value) return
    const newPhotoState: PhotoStateInIDB = await this.convertOutToIn(value)
    const store = PhotoDB._db
    // BUG: 保存は問題ないが、エラーが出る。
    // instanceでfileNameを一意にしているが以下のようなエラー内容となる。
    // Uncaught (in promise) DOMException: Unable to add key to index 'fileName': at least one key does not satisfy the uniqueness requirements.
    await store.put(PhotoDB._DB_STORE_NAME, newPhotoState)
      .then((ret: any) => console.log(ret)).catch((err: any) => console.error(err))
  }

  /**
   * indexedDBからPhotoStateを取得する
   * @param key S3絶対パスから拡張子をとった文字列
   * @returns PhotoState
   * @see {@link PhotoState}
   */
  public async getItem(key: string): Promise<PhotoState | undefined> {
    if (!PhotoDB._db) await PhotoDB.openIDB()
    const store = PhotoDB._db
      .transaction(PhotoDB._DB_STORE_NAME, 'readonly')
      .objectStore(PhotoDB._DB_STORE_NAME)
      .index('fileName')
    const value = await store.get(key).catch((err: any) => console.error(err))
    // ファイルが見つからない場合は、undefinedを返す
    if (value === undefined) {
      return undefined
    }
    // BUG: iPadでは、indexedDBに画像を保存する時はarrayBufferにしないといけないようである。
    // arrayBufferからBlobに直してから出力する
    const newPhotoState: PhotoState = this.convertInToOut(value)
    return newPhotoState
  }

  /**
   * indexedDBにおける、S3絶対パスの前方一致クエリ
   * 部位ごとや、被害箇所ごとに画像を取得するときに便利
   * @param key S3絶対パスから、取得したい範疇分削除した文字列
   * @return PhotoState[]
   * @see {@link PhotoState}
   */
  public async queryPrefixMatch(key: string): Promise<PhotoState[]> {
    if (!PhotoDB._db) await PhotoDB.openIDB()
    const nextStr = key.slice(0, -1) + String.fromCharCode(key.slice(-1).charCodeAt(0) + 1)
    const range = IDBKeyRange.bound(key, nextStr, false, true)
    const store = PhotoDB._db
      .transaction(PhotoDB._DB_STORE_NAME, 'readonly')
      .objectStore(PhotoDB._DB_STORE_NAME)
      .index('fileName')
    const value = await store.getAll(range)
    // ファイルが見つからない場合は、空を返す
    if (value.length < 1) {
      return []
    }
    // BUG: iPadでは、indexedDBに画像を保存する時はarrayBufferにしないといけないようである。
    // arrayBufferからBlobに直してから出力する
    const newPhotoState: PhotoState[] = value.map((item: PhotoStateInIDB) => {
      return this.convertInToOut(item)
    })
    return newPhotoState
  }

  public async *queryPrefixMatchLazy(key: string) {
    if (!PhotoDB._db) await PhotoDB.openIDB()
    const cursor = (await PhotoDB._db
      .transaction(PhotoDB._DB_STORE_NAME, 'readonly')
      .objectStore(PhotoDB._DB_STORE_NAME)
      .openCursor())
    // ファイルが見つからない場合は、空を返す
    let ret: PhotoState[] = []
    let limit = 0
    while (cursor) {
      if (cursor.value.fileName.indexOf(key) === 0) {
        ret.push(cursor.value)
      }
      limit++
      if (limit === PhotoDB.ONCE_QUERY_LIMIT) {
        yield ret
        ret = []
        limit = 0
      }
    }
    yield ret
  }

  /**
   * indexedDBからkeyに対応するPhotoStateを削除する
   * @see {link PhotoState}
   * @param key S3絶対パスから拡張子をとった文字列
   * @returns Promise<void>
   */
  public async deleteItem(keypath: string): Promise<void> {
    if (!PhotoDB._db) await PhotoDB.openIDB()
    const store = PhotoDB._db
      .transaction([PhotoDB._DB_STORE_NAME], 'readwrite')
      .objectStore(PhotoDB._DB_STORE_NAME)
    const key = await store.index('fileName').getKey(keypath)
    await store.delete(key as IDBValidKey)
  }

  /**
   * サムネイル用の画像を保存する
   * @param value PhotoState
   * @param maxWidth サムネ最大横幅px
   * @param maxHeight サムネ最大立幅px
   */
  public async insertThumbnail(value: PhotoState, maxWidth = THUMBNAIL_WIDTH, maxHeight = THUMBNAIL_HEIGHT): Promise<void> {
    const compressed: PhotoState = await this.compress(value, PhotoDB.THUMBNAIL_QUALITY, maxWidth, maxHeight)
    await this.insertItem({ ...compressed, fileName: PhotoDB.THUMBNAIL_PREFIX + value.fileName })
  }

  /**
   * サムネイル用の画像を1枚取得する
   * @param key ファイル名
   * @returns サムネイル用のPhotoState
   */
  public async getThumbnail(key: string) {
    return await this.getItem(PhotoDB.THUMBNAIL_PREFIX + key)
  }

  /**
   * 
   * @param key ファイル名に前方一致させたい文字列
   * @returns PhotoState[] 複数の画像データ
   */
  public async queryThumbnail(key: string) {
    return await this.queryPrefixMatch(PhotoDB.THUMBNAIL_PREFIX + key)
  }

  /**
   * 1)撮影した画像そのもの, 2)サムネイル用の2データを保存する
   * @param value PhotoState
   * @param maxWidth サムネ最大横幅px
   * @param maxHeight サムネ最大縦幅px
   */
  public async insertItemWithThumbnail(value: PhotoState, maxWidth = THUMBNAIL_WIDTH, maxHeight = THUMBNAIL_HEIGHT): Promise<void> {
    console.log('PhotoDB.insertItemWithThumbnail', value)
    await this.insertItem(value)
    await this.insertThumbnail(value, maxWidth, maxHeight)
  }

  public async deleteItemWithThumbnail(key: string) {
    await this.deleteItem(key)
    await this.deleteItem(PhotoDB.THUMBNAIL_PREFIX + key)
  }

  /**
   * indexedDBからprefixに対応する複数のPhotoStateを削除する
   * @see {link PhotoState}
   * @param prefix S3絶対パスから、前方一致させたい文字列
   * @returns Promise<void>
   */
  public async bulkDeleteItems(prefix: string): Promise<void> {
    void this.queryPrefixMatch(prefix).then(async fileNames => {
      await fileNames.reduce(async (promise, photo) => {
        return await this.deleteItem(photo.fileName)
      }, Promise.resolve())
    })
  }

  /**
   * 有効期限切れのデータを一括削除する
   * @param time 削除の閾値エポック秒
   * TODO: insertItem時に24時間分の有効期限猶予を付けるのではなく
   * insertItem時には撮影時の時間を入れ、このメソッド内で有効期限の時間を操作できるようにする
   * 有効期限はprivate static readonlyで持っておく
   * TODO: 部位のinsertPhotoToIDBで追加している86400が間違っており、その差分を打ち消す実装にしています 2021/12/10 habu
   */
  public async bulkDeleteExpiredItemsFromIDB(now: number = Date.now()): Promise<void> {
    let cursor = (await PhotoDB._db
      .transaction(PhotoDB._DB_STORE_NAME, 'readwrite')
      .objectStore(PhotoDB._DB_STORE_NAME)
      .openCursor())
    while (cursor) {
      // 撮影時刻 + 有効期限差分 < 現在時間だったら写真を削除する
      if (cursor.value.expirationDate + PhotoDB.EXPIRATION_DELTA < now) {
        cursor.delete()
      }
      cursor = await cursor.continue()
    }
  }
}

/* eslint-enable @typescript-eslint/strict-boolean-expressions */
/* eslint-enable @typescript-eslint/no-non-null-assertion */
/* eslint-enable @typescript-eslint/restrict-plus-operands */
