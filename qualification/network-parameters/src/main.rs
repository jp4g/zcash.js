use std::io::{self, BufRead};
use network_parameters_qualification::{observe, source_constants};
fn main() {
    if std::env::args().nth(1).as_deref() == Some("--constants") {
        println!("{}", source_constants());
        return;
    }
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        let (hex, height) = line.split_once('\t').expect("hex TAB u32");
        assert!(hex.len() % 2 == 0);
        let bytes = (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i+2], 16).unwrap()).collect::<Vec<_>>();
        match observe(&bytes, height.parse().unwrap()) {
            Ok(value) => println!("{value}"),
            Err(_) => println!("null"),
        }
    }
}
