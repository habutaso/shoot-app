/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-plus-operands */

import { openDB } from 'idb'

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
interface PhotoState {
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
}

/**
 * indexedDBに保存する画像管理オブジェクト
 */
interface PhotoStateInIDB extends PhotoState {
  /**
   * 写真データ
   * NOTE: indexedDBの内側では、画像をarraybufferとして扱う
   * BUG: iPadでは、indexedDBでBlobを扱うことができない。その代わりArrayBufferで保存する方法がある。
   * @see {@link https://stackoverflow.com/questions/40393488/mobile-safari-10-indexeddb-blobs}
   */
  blob: ArrayBuffer
}

/**
 * indexedDB外での画像管理オブジェクト
 */
export interface PhotoStateOutsideIDB extends PhotoState {
  /**
   * 写真データ
   * NOTE: indexedDBの外側では、画像をblobとして扱う
   * BUG: iPadでは、indexedDBでBlobを扱うことができない。その代わりArrayBufferで保存する方法がある。
   * @see {@link https://stackoverflow.com/questions/40393488/mobile-safari-10-indexeddb-blobs}
   */
  blob: Blob
}

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
   * シングルトンインスタンス
   */
  private static _instance: PhotoDB
  /**
   * indexedDBクラス
   * TODO: add type 2021/11/25 habu
   */
  private static _db: any

  /**
   * シングルトンインスタンスを取得する
   * @readonly
   * @param なし
   * @returns PhotoDB - インスタンス
   */
  public static get instance(): any {
    if (!PhotoDB._instance) {
      const db = openDB(PhotoDB._DB_NAME, 1, {
        upgrade(db) {
          const store = db.createObjectStore(PhotoDB._DB_STORE_NAME, { keyPath: 'id', autoIncrement: true })
          store.createIndex('fileName', 'fileName', { unique: true })
          store.createIndex('expirationDate', 'expirationDate', { unique: false })
        }
      })
      PhotoDB._instance = new PhotoDB()
      PhotoDB._db = db
      return PhotoDB._instance
    }
    return PhotoDB._instance
  }

  /**
   * PhotoStateInIDBからPhotoStateOutsideIDBに変換する
   * mobile iOSのindexedDBから取ってきた画像arraybufferをblobに変換して出力
   * @param state PhotoStateInIDB
   * @returns PhotoStateOutsideIDB
   */
  private convertInToOut(state: PhotoStateInIDB): PhotoStateOutsideIDB {
    const newBlob = new Blob([state.blob])
    return { ...state, blob: newBlob }
  }

  /**
   * PhotoStateOutsideIDBからPhotoStateInIDBに変換する
   * mobile iOSのindexedDBに画像を保存するため、blobからarraybufferに変換する
   * @param state PhotoStateOutsideIDB
   * @returns PhotoStateInIDB
   */
  private async convertOutToIn(state: PhotoStateOutsideIDB): Promise<PhotoStateInIDB> {
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
  public async insertItem(value: PhotoStateOutsideIDB | null): Promise<void> {
    // BUG: iPadでは、indexedDBに画像を保存する時はarrayBufferにしないといけないようである。
    if (!value) return
    const newPhotoState: PhotoStateInIDB = await this.convertOutToIn(value)
    const store = (await PhotoDB._db)
    // BUG: 保存は問題ないが、エラーが出る。
    // instanceでfileNameを一意にしているが以下のようなエラー内容となる。
    // Uncaught (in promise) DOMException: Unable to add key to index 'fileName': at least one key does not satisfy the uniqueness requirements.
    store.put(PhotoDB._DB_STORE_NAME, newPhotoState).then((ret: any) => console.log(ret)).catch((err: any) => console.log(err))
    value = null
  }

  /**
   * indexedDBからPhotoStateを取得する
   * @param key S3絶対パスから拡張子をとった文字列
   * @returns PhotoState
   * @see {@link PhotoState}
   */
  public async getItem(key: string): Promise<PhotoStateOutsideIDB | undefined> {
    const store = (await PhotoDB._db)
      .transaction(PhotoDB._DB_STORE_NAME, 'readonly')
      .objectStore(PhotoDB._DB_STORE_NAME)
      .index('fileName')
    const value = await store.get(key)
    // ファイルが見つからない場合は、undefinedを返す
    if (value === undefined) {
      return undefined
    }
    // BUG: iPadでは、indexedDBに画像を保存する時はarrayBufferにしないといけないようである。
    // arrayBufferからBlobに直してから出力する
    const newPhotoState: PhotoStateOutsideIDB = this.convertInToOut(value)
    return newPhotoState
  }

  /**
   * indexedDBにおける、S3絶対パスの前方一致クエリ
   * 部位ごとや、被害箇所ごとに画像を取得するときに便利
   * @param key S3絶対パスから、取得したい範疇分削除した文字列
   * @return PhotoState[]
   * @see {@link PhotoState}
   */
  public async queryPrefixMatch(key: string): Promise<PhotoStateOutsideIDB[]> {
    const nextStr = key.slice(0, -1) + String.fromCharCode(key.slice(-1).charCodeAt(0) + 1)
    const range = IDBKeyRange.bound(key, nextStr, false, true)
    const store = (await PhotoDB._db)
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
    const newPhotoState: PhotoStateOutsideIDB[] = value.map((item: PhotoStateInIDB) => {
      return this.convertInToOut(item)
    })
    return newPhotoState
  }

  /**
   * indexedDBからkeyに対応するPhotoStateを削除する
   * @see {link PhotoState}
   * @param key S3絶対パスから拡張子をとった文字列
   * @returns Promise<void>
   */
  public async deleteItem(keypath: string): Promise<void> {
    const store = (await PhotoDB._db)
      .transaction([PhotoDB._DB_STORE_NAME], 'readwrite')
      .objectStore(PhotoDB._DB_STORE_NAME)
    const key = await store.index('fileName').getKey(keypath)
    await store.delete(key)
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
    let cursor = await (await PhotoDB._db)
      .transaction(PhotoDB._DB_STORE_NAME, 'readwrite')
      .objectStore(PhotoDB._DB_STORE_NAME)
      .openCursor()
    while (await cursor) {
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
