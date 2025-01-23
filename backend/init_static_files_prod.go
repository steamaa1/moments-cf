//go:build prod
package main

import (
	"embed"
)

//go:embed public/*
var embedPublicFiles embed.FS

func init() {
	staticFiles = &embedPublicFiles
}
