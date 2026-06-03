//go:build ignore

package main

import "fmt"
import "time"

func main() {
	time.Sleep(3 * time.Second)
	fmt.Println("Hello World")
	time.Sleep(3 * time.Second)
}
