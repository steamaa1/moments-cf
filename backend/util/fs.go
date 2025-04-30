package fs_util

import (
	"crypto/md5"
	"encoding/hex"
	"io"
	"mime/multipart"
	"os"
)

func Exists(path string) bool {
	_, err := os.Stat(path)
	if err != nil {
		return os.IsExist(err)
	}

	return true
}

func CalHash(file *multipart.File) (string, error) {
	hash := md5.New()
	if _, err := io.Copy(hash, *file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
