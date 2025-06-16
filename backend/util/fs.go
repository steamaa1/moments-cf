package fs_util

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
)

func Exists(path string) bool {
	_, err := os.Stat(path)
	if err != nil {
		return os.IsExist(err)
	}

	return true
}

func Sha256(reader io.Reader) (string, error) {
	hash := sha256.New()
	if _, err := io.Copy(hash, reader); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}
